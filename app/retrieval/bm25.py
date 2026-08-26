"""Lexical retrieval with BM25 (rank-bm25) over the chunk corpus in Postgres.

Scalability note: the corpus is loaded from the database and re-indexed on
every search. That is deliberate — at benchmark scale (a few thousand chunks)
a fresh BM25Okapi build takes milliseconds and is always consistent with the
database. A persistent inverted index (e.g. Postgres full-text search) would
be the upgrade path for larger corpora.
"""

import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from rank_bm25 import BM25Okapi
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.logging import get_logger
from app.models import Chunk, Document
from app.retrieval.base import RetrievalMode, RetrievedChunk, SearchFilters
from app.retrieval.vector import apply_search_filters

logger = get_logger(__name__)

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)+|[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    """Lowercase and split on non-alphanumerics, keeping numbers.

    Digit-and-dash identifiers such as ``INV-2025-83614`` are indexed both as
    the whole token and as their split parts, so exact-identifier queries and
    partial matches both work.
    """
    tokens: list[str] = []
    for match in _TOKEN_RE.finditer(text.lower()):
        token = match.group(0)
        tokens.append(token)
        if "-" in token:
            tokens.extend(part for part in token.split("-") if part)
    return tokens


@dataclass(frozen=True, slots=True)
class CorpusEntry:
    """One chunk of the searchable corpus, with the metadata a result needs."""

    chunk_id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    document_type: str | None
    page_number: int | None
    section: str | None
    text: str


def rank_corpus(
    query: str, entries: Sequence[CorpusEntry], *, top_k: int = 10
) -> list[RetrievedChunk]:
    """Score a corpus with BM25Okapi and return the top_k overlapping chunks.

    Only chunks sharing at least one token with the query are candidates: raw
    BM25 scores cannot express relevance cutoffs on small corpora, where IDF
    for a term present in every document is zero or negative. Deterministic:
    ties are broken by chunk_id hex so identical corpora always produce
    identical rankings.
    """
    if not entries:
        return []
    tokenized = [tokenize(entry.text) for entry in entries]
    if not any(tokenized):
        return []
    query_tokens = tokenize(query)
    if not query_tokens:
        return []
    query_token_set = set(query_tokens)
    scores = BM25Okapi(tokenized).get_scores(query_tokens)
    candidates = [
        index for index, tokens in enumerate(tokenized) if query_token_set.intersection(tokens)
    ]
    order = sorted(
        candidates,
        key=lambda index: (-float(scores[index]), entries[index].chunk_id.hex),
    )
    results: list[RetrievedChunk] = []
    for index in order[:top_k]:
        entry = entries[index]
        results.append(
            RetrievedChunk(
                chunk_id=entry.chunk_id,
                document_id=entry.document_id,
                filename=entry.filename,
                document_type=entry.document_type,
                page_number=entry.page_number,
                section=entry.section,
                text=entry.text,
                score=float(scores[index]),
                rank=len(results) + 1,
                mode=RetrievalMode.BM25,
            )
        )
    return results


class BM25Retriever:
    """Lexical retriever: loads the (filtered) chunk corpus and ranks with BM25."""

    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
        self._sessionmaker = sessionmaker

    async def search(
        self,
        query: str,
        *,
        top_k: int = 10,
        filters: SearchFilters | None = None,
    ) -> list[RetrievedChunk]:
        entries = await self._load_corpus(filters)
        results = rank_corpus(query, entries, top_k=top_k)
        logger.debug(
            "bm25_search",
            query=query,
            top_k=top_k,
            corpus_size=len(entries),
            result_count=len(results),
        )
        return results

    async def _load_corpus(self, filters: SearchFilters | None) -> list[CorpusEntry]:
        statement = (
            select(Chunk, Document.filename, Document.document_type)
            .join(Document, Document.id == Chunk.document_id)
            .order_by(Chunk.document_id, Chunk.order_index)
        )
        statement = apply_search_filters(statement, filters)
        async with self._sessionmaker() as session:
            rows = (await session.execute(statement)).all()
        return [
            CorpusEntry(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                filename=filename,
                document_type=document_type,
                page_number=chunk.page_number,
                section=chunk.section,
                text=chunk.text,
            )
            for chunk, filename, document_type in rows
        ]
