from typing import Any
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.dependencies import get_compare_service

router = APIRouter(tags=["compare"])


class CompareRequest(BaseModel):
    document_ids: list[UUID] | None = None
    case_id: str | None = None


@router.post("/compare")
async def compare_documents(request: CompareRequest) -> dict[str, Any]:
    """Run the cross-document discrepancy workflow over a document pack."""
    service = get_compare_service()
    return await service.run(
        document_ids=[str(document_id) for document_id in request.document_ids or []] or None,
        case_id=request.case_id,
    )
