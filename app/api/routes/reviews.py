from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, model_validator

from app.api.dependencies import get_review_service
from app.core.exceptions import AppError
from app.models import ReviewTask

router = APIRouter(tags=["reviews"])

BatchAction = Literal["approve", "reject", "resolve"]
_BATCH_DECISIONS: dict[str, str] = {"approve": "APPROVED", "reject": "REJECTED"}


class ReviewDecisionRequest(BaseModel):
    reviewer: Annotated[str, Field(min_length=1, max_length=128)]
    note: Annotated[str | None, Field(max_length=2_000)] = None


class BatchReviewRequest(BaseModel):
    """Apply one decision to many review tasks; transition rules stay in ReviewService."""

    review_ids: Annotated[list[UUID], Field(min_length=1, max_length=500)]
    action: BatchAction
    reviewer: Annotated[str | None, Field(max_length=128)] = None
    note: Annotated[str | None, Field(max_length=2_000)] = None

    @model_validator(mode="after")
    def validate_reviewer_for_decisions(self) -> "BatchReviewRequest":
        if self.action in _BATCH_DECISIONS and not (self.reviewer or "").strip():
            raise ValueError("reviewer is required to approve or reject findings")
        return self

    def unique_ids(self) -> list[UUID]:
        seen: dict[UUID, None] = {}
        for review_id in self.review_ids:
            seen.setdefault(review_id, None)
        return list(seen)


def _serialize(task: ReviewTask) -> dict[str, Any]:
    return {
        "review_id": str(task.id),
        "workflow_run_id": str(task.workflow_run_id) if task.workflow_run_id else None,
        "case_id": task.case_id,
        "discrepancy": task.discrepancy,
        "severity": task.severity,
        "status": task.status,
        "reviewer": task.reviewer,
        "note": task.note,
        "decided_at": task.decided_at.isoformat() if task.decided_at else None,
        "created_at": task.created_at.isoformat(),
    }


@router.get("/reviews")
async def list_reviews(
    status: str | None = Query(default=None),
    case_id: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    service = get_review_service()
    tasks = await service.list_tasks(
        status=status, case_id=case_id, severity=severity, limit=limit, offset=offset
    )
    total = await service.count_tasks(status=status, case_id=case_id, severity=severity)
    return {"reviews": [_serialize(task) for task in tasks], "count": len(tasks), "total": total}


@router.post("/reviews/{review_id}/approve")
async def approve_review(review_id: UUID, request: ReviewDecisionRequest) -> dict[str, Any]:
    task = await get_review_service().decide(
        review_id, "APPROVED", reviewer=request.reviewer, note=request.note
    )
    return _serialize(task)


@router.post("/reviews/{review_id}/reject")
async def reject_review(review_id: UUID, request: ReviewDecisionRequest) -> dict[str, Any]:
    task = await get_review_service().decide(
        review_id, "REJECTED", reviewer=request.reviewer, note=request.note
    )
    return _serialize(task)


@router.post("/reviews/{review_id}/resolve")
async def resolve_review(review_id: UUID) -> dict[str, Any]:
    task = await get_review_service().resolve(review_id)
    return _serialize(task)


@router.post("/reviews/batch")
async def batch_decide_reviews(request: BatchReviewRequest) -> dict[str, Any]:
    """Apply one decision across many findings, reporting each outcome separately."""
    service = get_review_service()
    reviewer = (request.reviewer or "").strip()
    decision = _BATCH_DECISIONS.get(request.action)

    updated: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    for review_id in request.unique_ids():
        try:
            if decision is None:
                task = await service.resolve(review_id)
            else:
                task = await service.decide(
                    review_id, decision, reviewer=reviewer, note=request.note
                )
        except AppError as exc:
            failed.append(
                {
                    "review_id": str(review_id),
                    "error": exc.error_code,
                    "message": exc.message,
                }
            )
        else:
            updated.append(_serialize(task))

    return {
        "action": request.action,
        "requested_count": len(request.review_ids),
        "updated": updated,
        "updated_count": len(updated),
        "failed": failed,
        "failed_count": len(failed),
    }
