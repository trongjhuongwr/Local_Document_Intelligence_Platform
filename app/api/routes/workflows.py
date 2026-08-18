from typing import Any
from uuid import UUID

from fastapi import APIRouter

from app.core.exceptions import WorkflowNotFoundError
from app.db.session import get_sessionmaker
from app.models import WorkflowRun

router = APIRouter(tags=["workflows"])


def serialize_workflow(run: WorkflowRun) -> dict[str, Any]:
    steps = list(run.steps or [])
    completed = sum(item.get("status") == "completed" for item in steps)
    progress = (
        round(completed / len(steps) * 100) if steps else (100 if run.status == "completed" else 0)
    )
    current = next((item.get("label") for item in steps if item.get("status") == "running"), None)
    return {
        "workflow_id": str(run.id),
        "workflow_type": run.workflow_type,
        "case_id": run.case_id,
        "status": run.status,
        "route": run.route,
        "input": run.input_payload,
        "result": run.result,
        "report_markdown": run.result.get("report_markdown", "") if run.result else "",
        "steps": steps,
        "progress_percent": progress,
        "current_step": current,
        "errors": run.errors,
        "requires_review": run.requires_review,
        "duration_ms": run.duration_ms,
        "created_at": run.created_at.isoformat(),
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: UUID) -> dict[str, Any]:
    async with get_sessionmaker()() as session:
        run = await session.get(WorkflowRun, workflow_id)
        if run is None:
            raise WorkflowNotFoundError(f"Workflow {workflow_id} not found")
        return serialize_workflow(run)
