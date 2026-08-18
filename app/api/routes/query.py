from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.retrieval.base import RetrievalMode, SearchFilters

router = APIRouter(tags=["query"])


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2_000)
    mode: RetrievalMode = Field(
        default_factory=lambda: RetrievalMode(get_settings().default_retrieval_mode)
    )
    top_k: int = Field(default=10, ge=1, le=50)
    filters: SearchFilters | None = None


@router.post("/query")
async def query_documents(request: QueryRequest) -> dict[str, Any]:
    """Answer a question with retrieval-grounded, citation-verified synthesis."""
    from app.api.dependencies import get_qa_service

    result = await get_qa_service().answer(
        request.question,
        mode=request.mode,
        top_k=request.top_k,
        filters=request.filters,
    )
    return result.model_dump(mode="json")
