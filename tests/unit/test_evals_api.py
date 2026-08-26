"""API-level tests for the evaluation endpoints (no database, no real subprocess)."""

import httpx
import pytest

from app.api.routes import evals as evals_route
from app.services.evals_runner import (
    DEFAULT_EVAL_CASES,
    MAX_EVAL_CASES,
    REPORT_SECTIONS,
    EvalRunInProgressError,
    EvalRunState,
    EvalsRunner,
)

_METRIC_KEYS = {
    "results",
    "metrics",
    "recall",
    "precision",
    "f1",
    "accuracy",
    "recall_at_5",
    "mrr",
    "overall_field_accuracy",
}


class StubProcess:
    def __init__(self) -> None:
        self.returncode: int | None = None

    # Argument names mirror subprocess.Popen.communicate.
    def communicate(self, input=None, timeout=None):
        self.returncode = 0
        return "done", ""


def _inline_executor(work):
    work()
    return None


@pytest.fixture
def stub_runner(monkeypatch: pytest.MonkeyPatch, tmp_path) -> EvalsRunner:
    runner = EvalsRunner(
        root=tmp_path, launcher=lambda command, cwd: StubProcess(), executor=_inline_executor
    )
    monkeypatch.setattr(evals_route, "get_evals_runner", lambda: runner)
    return runner


async def test_get_evals_serves_the_real_report_directory(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/evals")
    assert response.status_code == 200
    body = response.json()

    assert set(body) >= {"results", "missing", "skipped", "source_generated_at", "reports_dir"}
    assert body["sections"] == list(REPORT_SECTIONS)
    # every returned section came from a file and carries that file's own timestamp
    for section, payload in body["results"].items():
        assert section in REPORT_SECTIONS
        assert payload["generated_at"] == body["source_generated_at"][section]
    # nothing is both present and missing
    assert set(body["results"]).isdisjoint(body["missing"])


async def test_run_returns_202_and_never_returns_metrics(
    client: httpx.AsyncClient, stub_runner: EvalsRunner
) -> None:
    response = await client.post("/api/evals/run", json={"mode": "full"})
    assert response.status_code == 202
    body = response.json()

    assert body["status"] in {"queued", "running", "completed"}
    assert body["cases"] == DEFAULT_EVAL_CASES
    assert body["command"][1:4] == ["-m", "evals.run_all", "--cases"]
    assert _METRIC_KEYS.isdisjoint(body)
    assert body["poll_url"] == f"/api/evals/runs/{body['run_id']}"


async def test_run_accepts_an_explicit_case_count(
    client: httpx.AsyncClient, stub_runner: EvalsRunner
) -> None:
    response = await client.post("/api/evals/run", json={"cases": 2})
    assert response.status_code == 202
    assert response.json()["cases"] == 2


async def test_run_accepts_an_empty_body(
    client: httpx.AsyncClient, stub_runner: EvalsRunner
) -> None:
    response = await client.post("/api/evals/run")
    assert response.status_code == 202
    assert response.json()["cases"] == DEFAULT_EVAL_CASES


async def test_run_rejects_an_out_of_range_case_count(
    client: httpx.AsyncClient, stub_runner: EvalsRunner
) -> None:
    assert (await client.post("/api/evals/run", json={"cases": 0})).status_code == 422
    too_many = await client.post("/api/evals/run", json={"cases": MAX_EVAL_CASES + 1})
    assert too_many.status_code == 422


async def test_run_returns_409_while_another_run_is_in_flight(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    active = EvalRunState(run_id="active-run", cases=5, command=["python"], status="running")

    class BusyRunner:
        def start(self, cases: int) -> EvalRunState:
            raise EvalRunInProgressError(
                "An evaluation run is already in flight",
                details={"active_run": active.to_dict()},
            )

    monkeypatch.setattr(evals_route, "get_evals_runner", lambda: BusyRunner())

    response = await client.post("/api/evals/run", json={"mode": "full"})
    assert response.status_code == 409
    body = response.json()
    assert body["error"] == "eval_run_in_progress"
    assert body["details"]["active_run"]["run_id"] == "active-run"
    assert body["details"]["active_run"]["status"] == "running"


async def test_run_status_can_be_polled(
    client: httpx.AsyncClient, stub_runner: EvalsRunner
) -> None:
    run_id = (await client.post("/api/evals/run", json={"cases": 1})).json()["run_id"]

    polled = await client.get(f"/api/evals/runs/{run_id}")
    assert polled.status_code == 200
    assert polled.json()["status"] == "completed"
    assert _METRIC_KEYS.isdisjoint(polled.json())

    # the singular spelling resolves to the same run
    alias = await client.get(f"/api/evals/run/{run_id}")
    assert alias.status_code == 200
    assert alias.json() == polled.json()

    missing = await client.get("/api/evals/runs/not-a-run")
    assert missing.status_code == 404
    assert missing.json()["error"] == "eval_run_not_found"


async def test_status_endpoint_reports_limits_and_last_run(
    client: httpx.AsyncClient, stub_runner: EvalsRunner
) -> None:
    idle = (await client.get("/api/evals/status")).json()
    assert idle["running"] is False
    assert idle["active_run"] is None
    assert idle["latest_run"] is None
    assert idle["default_cases"] == DEFAULT_EVAL_CASES
    assert idle["max_cases"] == MAX_EVAL_CASES

    await client.post("/api/evals/run", json={"cases": 1})
    after = (await client.get("/api/evals/status")).json()
    assert after["running"] is False
    assert after["latest_run"]["status"] == "completed"
