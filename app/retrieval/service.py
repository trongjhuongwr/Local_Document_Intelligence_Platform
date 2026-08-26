"""Retrieval service: wires the BM25, dense, and hybrid retrievers together.

BM25 works with only Postgres running. Dense and hybrid modes need embeddings,
so they raise :class:`app.core.exceptions.OllamaUnavailableError` when the
Ollama server is unreachable.
"""

import uuid
from time import perf_counter
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.session import get_sessionmaker
from app.embeddings.ollama import OllamaEmbeddingProvider
from app.retrieval.base import RetrievalMode, RetrievedChunk, Retriever, SearchFilters
from app.retrieval.bm25 import BM25Retriever
from app.retrieval.hybrid import HybridRetriever
from app.retrieval.indexer import ChunkIndexer
from app.retrieval.vector import DenseRetriever

logger = get_logger(__name__)


class SearchEmbeddingProvider(Protocol):
    """Embeds document batches (for indexing) and single queries (for search)."""

    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


class RetrievalService:
    """Facade over indexing and the three retrieval modes."""

    def __init__(
        self,
        *,
        sessionmaker: async_sessionmaker[AsyncSession] | None = None,
        embedding_provider: SearchEmbeddingProvider | None = None,
        model_name: str | None = None,
    ) -> None:
        maker = sessionmaker or get_sessionmaker()
        provider = embedding_provider or OllamaEmbeddingProvider()
        self._bm25 = BM25Retriever(maker)
        self._dense = DenseRetriever(provider, maker)
        self._hybrid = HybridRetriever(self._bm25, self._dense)
        self._indexer = ChunkIndexer(provider, maker, model_name=model_name)
        self._retrievers: dict[RetrievalMode, Retriever] = {
            RetrievalMode.BM25: self._bm25,
            RetrievalMode.DENSE: self._dense,
            RetrievalMode.HYBRID: self._hybrid,
        }

    async def search(
        self,
        query: str,
        *,
        mode: RetrievalMode | None = None,
        top_k: int = 10,
        filters: SearchFilters | None = None,
    ) -> list[RetrievedChunk]:
        """Search with the requested or measured-default retrieval mode."""
        started = perf_counter()
        selected_mode = mode or RetrievalMode(get_settings().default_retrieval_mode)
        candidates = await self._retrievers[selected_mode].search(
            query, top_k=top_k, filters=filters
        )
        selected = candidates[:top_k]
        latency_ms = (perf_counter() - started) * 1000.0
        logger.info(
            "retrieval_search",
            query=query,
            mode=str(selected_mode),
            top_k=top_k,
            candidate_count=len(candidates),
            selected_count=len(selected),
            latency_ms=round(latency_ms, 1),
            document_ids=sorted({str(chunk.document_id) for chunk in selected}),
        )
        return selected

    async def index_document(self, document_id: uuid.UUID) -> int:
        """Embed and store vectors for every un-indexed chunk of one document."""
        return await self._indexer.index_document(document_id)

    async def index_pending(self) -> int:
        """Embed and store vectors for every un-indexed chunk in the database."""
        return await self._indexer.index_pending()
