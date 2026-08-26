"""Evaluation endpoints: serve the real reports, launch the real suite.

``GET /evals`` returns exactly what ``evals/reports/*_latest.json`` contains.
``POST /evals/run`` starts the suite as a background subprocess and returns a run
id — never metrics. Refreshed numbers appear through ``GET /evals`` once the run
has rewritten the report files.
"""

from typing import Annotated, Any

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.api.dependencies import get_evals_runner
from app.services.evals_runner import (
    DEFAULT_EVAL_CASES,
    MAX_EVAL_CASES,
    MIN_EVAL_CASES,
    read_reports,
)

router = APIRouter(prefix="/evals", tags=["evals"])


class EvalRunRequest(BaseModel):
    """Body of ``POST /evals/run``.

    ``mode`` is accepted because the SPA sends it, but it selects nothing: the
    suite always runs ``python -m evals.run_all --cases <cases>``.
    """

    cases: Annotated[int, Field(ge=MIN_EVAL_CASES, le=MAX_EVAL_CASES)] = DEFAULT_EVAL_CASES
    mode: str | None = None


@router.get("")
def get_evals() -> dict[str, Any]:
    """Return the evaluation reports that exist on disk, and name the ones that do not."""
    return read_reports()


@router.post("/run", status_code=status.HTTP_202_ACCEPTED)
def start_eval_run(request: EvalRunRequest | None = None) -> dict[str, Any]:
    """Launch the evaluation suite. Returns the run id; polling reports progress."""
    payload = request or EvalRunRequest()
    state = get_evals_runner().start(payload.cases)
    return {
        **state.to_dict(),
        "poll_url": f"/api/evals/runs/{state.run_id}",
        "note": (
            "Metrics are never returned by this endpoint. Poll the run, then GET "
            "/api/evals once it completes to read the regenerated reports."
        ),
    }


@router.get("/runs/{run_id}")
def get_eval_run(run_id: str) -> dict[str, Any]:
    return get_evals_runner().get(run_id).to_dict()


@router.get("/run/{run_id}", include_in_schema=False)
def get_eval_run_singular(run_id: str) -> dict[str, Any]:
    """Alias for /evals/runs/{run_id}; kept so either spelling resolves."""
    return get_evals_runner().get(run_id).to_dict()


@router.get("/status")
def get_eval_status() -> dict[str, Any]:
    runner = get_evals_runner()
    active = runner.active()
    latest = runner.latest()
    return {
        "running": active is not None,
        "active_run": active.to_dict() if active else None,
        "latest_run": latest.to_dict() if latest else None,
        "default_cases": DEFAULT_EVAL_CASES,
        "min_cases": MIN_EVAL_CASES,
        "max_cases": MAX_EVAL_CASES,
    }
