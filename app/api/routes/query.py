from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.retrieval.base import RetrievalMode, SearchFilters

router = APIRouter(tags=["query"])


class QueryRequest(BaseModel):
    question: str
    mode: RetrievalMode = RetrievalMode.HYBRID
    top_k: int = 10
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
