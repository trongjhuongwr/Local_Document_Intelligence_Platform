"""Retrieval endpoints: chunk indexing and selectable retrieval search."""

import uuid
from time import perf_counter
from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.retrieval.base import RetrievalMode, RetrievedChunk, SearchFilters
from app.retrieval.service import RetrievalService

router = APIRouter(tags=["retrieval"])


class IndexResponse(BaseModel):
    document_id: uuid.UUID
    chunks_indexed: int


class SearchRequest(BaseModel):
    query: Annotated[str, Field(min_length=1, max_length=2000)]
    mode: RetrievalMode = Field(
        default_factory=lambda: RetrievalMode(get_settings().default_retrieval_mode)
    )
    top_k: Annotated[int, Field(ge=1, le=50)] = 10
    filters: SearchFilters | None = None


class SearchResponse(BaseModel):
    results: list[RetrievedChunk]
    latency_ms: float


@router.post("/documents/{document_id}/index")
async def index_document(document_id: uuid.UUID) -> IndexResponse:
    chunks_indexed = await RetrievalService().index_document(document_id)
    return IndexResponse(document_id=document_id, chunks_indexed=chunks_indexed)


@router.post("/search")
async def search(request: SearchRequest) -> SearchResponse:
    started = perf_counter()
    results = await RetrievalService().search(
        request.query,
        mode=request.mode,
        top_k=request.top_k,
        filters=request.filters,
    )
    latency_ms = round((perf_counter() - started) * 1000.0, 1)
    return SearchResponse(results=results, latency_ms=latency_ms)
