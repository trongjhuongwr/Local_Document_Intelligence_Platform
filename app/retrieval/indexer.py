"""Chunk embedding indexer: embeds chunks and stores vectors in chunk_embeddings.

Idempotent by design — chunks that already have a ``ChunkEmbedding`` row are
skipped, so re-running the indexer over the same corpus is a no-op.
"""

import uuid
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models import Chunk, ChunkEmbedding

logger = get_logger(__name__)


class EmbeddingProvider(Protocol):
    """Anything that can embed a batch of document texts (order-preserving)."""

    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...


class ChunkIndexer:
    """Embeds un-indexed chunks and persists one ChunkEmbedding row per chunk."""

    def __init__(
        self,
        embedding_provider: EmbeddingProvider,
        sessionmaker: async_sessionmaker[AsyncSession],
        *,
        model_name: str | None = None,
    ) -> None:
        self._provider = embedding_provider
        self._sessionmaker = sessionmaker
        self._model_name = model_name or get_settings().ollama_embedding_model

    async def index_document(self, document_id: uuid.UUID) -> int:
        """Embed every chunk of one document that lacks an embedding row."""
        count = await self._index(document_id=document_id)
        logger.info(
            "chunks_indexed",
            document_id=str(document_id),
            chunks_indexed=count,
            model=self._model_name,
        )
        return count

    async def index_pending(self) -> int:
        """Embed every chunk in the database that lacks an embedding row."""
        count = await self._index(document_id=None)
        logger.info("pending_chunks_indexed", chunks_indexed=count, model=self._model_name)
        return count

    async def _index(self, *, document_id: uuid.UUID | None) -> int:
        statement = (
            select(Chunk.id, Chunk.text)
            .outerjoin(ChunkEmbedding, ChunkEmbedding.chunk_id == Chunk.id)
            .where(ChunkEmbedding.id.is_(None))
            .order_by(Chunk.document_id, Chunk.order_index)
        )
        if document_id is not None:
            statement = statement.where(Chunk.document_id == document_id)

        async with self._sessionmaker() as session:
            rows = (await session.execute(statement)).all()
            if not rows:
                return 0
            chunk_ids = [row[0] for row in rows]
            vectors = await self._provider.embed_documents([row[1] for row in rows])
            session.add_all(
                ChunkEmbedding(
                    chunk_id=chunk_id,
                    model=self._model_name,
                    dimension=len(vector),
                    embedding=vector,
                )
                for chunk_id, vector in zip(chunk_ids, vectors, strict=True)
            )
            await session.commit()
        return len(chunk_ids)
