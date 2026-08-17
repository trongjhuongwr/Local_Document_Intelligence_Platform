"""Human review queue: findings become OPEN tasks; humans decide, we record."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.models import ReviewTask

logger = get_logger(__name__)

_DECISIONS = {"APPROVED", "REJECTED"}
_OPEN = "OPEN"
_RESOLVED = "RESOLVED"


class ReviewNotFoundError(AppError):
    status_code = 404
    error_code = "review_not_found"


class InvalidReviewTransitionError(AppError):
    status_code = 409
    error_code = "invalid_review_transition"


class ReviewService:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
        self._sessionmaker = sessionmaker

    async def create_many(
        self,
        workflow_run_id: str | None,
        case_id: str | None,
        discrepancies: list[dict[str, Any]],
    ) -> list[str]:
        tasks = [
            ReviewTask(
                workflow_run_id=uuid.UUID(workflow_run_id) if workflow_run_id else None,
                case_id=case_id,
                discrepancy=discrepancy,
                severity=str(discrepancy.get("severity", "medium")),
            )
            for discrepancy in discrepancies
        ]
        async with self._sessionmaker() as session:
            session.add_all(tasks)
            await session.commit()
            for task in tasks:
                await session.refresh(task)
        logger.info("review_tasks_created", count=len(tasks), case_id=case_id)
        return [str(task.id) for task in tasks]

    async def list_tasks(
        self,
        *,
        status: str | None = None,
        case_id: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[ReviewTask]:
        statement = select(ReviewTask).order_by(ReviewTask.created_at.desc(), ReviewTask.id)
        if status is not None:
            statement = statement.where(ReviewTask.status == status)
        if case_id is not None:
            statement = statement.where(ReviewTask.case_id == case_id)
        statement = statement.limit(limit).offset(offset)
        async with self._sessionmaker() as session:
            result = await session.execute(statement)
            return list(result.scalars().all())

    async def get(self, review_id: uuid.UUID) -> ReviewTask:
        async with self._sessionmaker() as session:
            task = await session.get(ReviewTask, review_id)
            if task is None:
                raise ReviewNotFoundError(f"Review task {review_id} not found")
            return task

    async def decide(
        self,
        review_id: uuid.UUID,
        decision: str,
        *,
        reviewer: str | None = None,
        note: str | None = None,
    ) -> ReviewTask:
        if decision not in _DECISIONS:
            raise InvalidReviewTransitionError(
                f"Decision must be one of {sorted(_DECISIONS)}", details={"given": decision}
            )
        async with self._sessionmaker() as session:
            task = await session.get(ReviewTask, review_id)
            if task is None:
                raise ReviewNotFoundError(f"Review task {review_id} not found")
            if task.status != _OPEN:
                raise InvalidReviewTransitionError(
                    f"Review task is {task.status}; only OPEN tasks can be decided"
                )
            task.status = decision
            task.reviewer = reviewer
            task.note = note
            task.decided_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(task)
        logger.info("review_decided", review_id=str(review_id), decision=decision)
        return task

    async def resolve(self, review_id: uuid.UUID) -> ReviewTask:
        async with self._sessionmaker() as session:
            task = await session.get(ReviewTask, review_id)
            if task is None:
                raise ReviewNotFoundError(f"Review task {review_id} not found")
            if task.status not in _DECISIONS:
                raise InvalidReviewTransitionError(
                    f"Review task is {task.status}; only decided tasks can be resolved"
                )
            task.status = _RESOLVED
            await session.commit()
            await session.refresh(task)
        return task
