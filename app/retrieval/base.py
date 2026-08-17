"""Shared retrieval types: every retriever (BM25, dense, hybrid) speaks these."""

from enum import StrEnum
from typing import Protocol
from uuid import UUID

from pydantic import BaseModel


class RetrievalMode(StrEnum):
    BM25 = "bm25"
    DENSE = "dense"
    HYBRID = "hybrid"


class SearchFilters(BaseModel):
    """Metadata filters applied before ranking."""

    document_ids: list[UUID] | None = None
    document_type: str | None = None
    case_id: str | None = None
    filename: str | None = None


class RetrievedChunk(BaseModel):
    """One ranked chunk with everything needed for citations."""

    chunk_id: UUID
    document_id: UUID
    filename: str
    document_type: str | None = None
    page_number: int | None = None
    section: str | None = None
    text: str
    score: float
    rank: int
    mode: RetrievalMode


class Retriever(Protocol):
    async def search(
        self,
        query: str,
        *,
        top_k: int = 10,
        filters: SearchFilters | None = None,
    ) -> list[RetrievedChunk]: ...
