from typing import Any
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, Field, model_validator

from app.api.dependencies import get_compare_service

router = APIRouter(tags=["compare"])


class CompareRequest(BaseModel):
    document_ids: list[UUID] | None = None
    case_id: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode="after")
    def validate_scope(self) -> "CompareRequest":
        has_documents = bool(self.document_ids)
        has_case = self.case_id is not None
        if has_documents == has_case:
            raise ValueError("Provide exactly one of document_ids or case_id")
        return self


@router.post("/compare")
async def compare_documents(request: CompareRequest) -> dict[str, Any]:
    """Run the cross-document discrepancy workflow over a document pack."""
    service = get_compare_service()
    return await service.run(
        document_ids=[str(document_id) for document_id in request.document_ids or []] or None,
        case_id=request.case_id,
    )
