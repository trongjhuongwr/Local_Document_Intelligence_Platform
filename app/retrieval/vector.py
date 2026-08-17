"""Dense retrieval over pgvector: cosine distance between query and chunk embeddings."""

from typing import Any, Protocol

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.logging import get_logger
from app.models import Chunk, ChunkEmbedding, Document
from app.retrieval.base import RetrievalMode, RetrievedChunk, SearchFilters

logger = get_logger(__name__)


class QueryEmbedder(Protocol):
    """Anything that can embed a single query string."""

    async def embed_query(self, text: str) -> list[float]: ...


def apply_search_filters(statement: Select[Any], filters: SearchFilters | None) -> Select[Any]:
    """Add WHERE clauses for the given filters to a chunks-JOIN-documents select."""
    if filters is None:
        return statement
    if filters.document_ids:
        statement = statement.where(Chunk.document_id.in_(filters.document_ids))
    if filters.document_type is not None:
        statement = statement.where(Document.document_type == filters.document_type)
    if filters.case_id is not None:
        statement = statement.where(Document.case_id == filters.case_id)
    if filters.filename is not None:
        statement = statement.where(Document.filename == filters.filename)
    return statement


class DenseRetriever:
    """Semantic search: embed the query, rank chunks by cosine similarity in SQL."""

    def __init__(
        self,
        embedding_provider: QueryEmbedder,
        sessionmaker: async_sessionmaker[AsyncSession],
    ) -> None:
        self._provider = embedding_provider
        self._sessionmaker = sessionmaker

    async def search(
        self,
        query: str,
        *,
        top_k: int = 10,
        filters: SearchFilters | None = None,
    ) -> list[RetrievedChunk]:
        query_vector = await self._provider.embed_query(query)
        distance = ChunkEmbedding.embedding.cosine_distance(query_vector).label("distance")
        statement = (
            select(Chunk, Document.filename, Document.document_type, distance)
            .join(Chunk, Chunk.id == ChunkEmbedding.chunk_id)
            .join(Document, Document.id == Chunk.document_id)
        )
        statement = apply_search_filters(statement, filters)
        statement = statement.order_by(distance, Chunk.id).limit(top_k)

        async with self._sessionmaker() as session:
            rows = (await session.execute(statement)).all()

        results = [
            RetrievedChunk(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                filename=filename,
                document_type=document_type,
                page_number=chunk.page_number,
                section=chunk.section,
                text=chunk.text,
                score=1.0 - float(dist),
                rank=rank,
                mode=RetrievalMode.DENSE,
            )
            for rank, (chunk, filename, document_type, dist) in enumerate(rows, start=1)
        ]
        logger.debug("dense_search", query=query, top_k=top_k, result_count=len(results))
        return results
