from typing import Any
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.api.dependencies import get_review_service
from app.models import ReviewTask

router = APIRouter(tags=["reviews"])


class ReviewDecisionRequest(BaseModel):
    reviewer: str | None = None
    note: str | None = None


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
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    tasks = await get_review_service().list_tasks(
        status=status, case_id=case_id, limit=limit, offset=offset
    )
    return {"reviews": [_serialize(task) for task in tasks], "count": len(tasks)}


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
