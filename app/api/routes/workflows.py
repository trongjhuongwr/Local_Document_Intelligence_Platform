from typing import Any
from uuid import UUID

from fastapi import APIRouter

from app.core.exceptions import WorkflowError
from app.db.session import get_sessionmaker
from app.models import WorkflowRun

router = APIRouter(tags=["workflows"])


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: UUID) -> dict[str, Any]:
    async with get_sessionmaker()() as session:
        run = await session.get(WorkflowRun, workflow_id)
        if run is None:
            raise WorkflowError(f"Workflow {workflow_id} not found")
        return {
            "workflow_id": str(run.id),
            "workflow_type": run.workflow_type,
            "status": run.status,
            "route": run.route,
            "input": run.input_payload,
            "result": run.result,
            "steps": run.steps,
            "errors": run.errors,
            "requires_review": run.requires_review,
            "duration_ms": run.duration_ms,
            "created_at": run.created_at.isoformat(),
        }
