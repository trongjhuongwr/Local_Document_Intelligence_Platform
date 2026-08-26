"""Unit tests for evaluation report reading and the suite runner state machine.

The state machine is driven by a stubbed launcher so single-flight, failure
handling and the metric-free payload can be asserted deterministically. One
test does spawn a real subprocess, to prove the production launcher really
reaches ``python -m evals.run_all`` from the repository root.
"""

import json
import sys
import threading
from pathlib import Path

import pytest

from app.services.evals_runner import (
    DEFAULT_EVAL_CASES,
    MAX_EVAL_CASES,
    REPORT_SECTIONS,
    EvalRunInProgressError,
    EvalRunNotFoundError,
    EvalsRunner,
    InvalidEvalRunRequestError,
    _default_launcher,
    read_reports,
    repo_root,
)

# --------------------------------------------------------------------------
# read_reports
# --------------------------------------------------------------------------


def _write_report(directory: Path, section: str, payload: dict) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"{section}_latest.json").write_text(json.dumps(payload), encoding="utf-8")


def test_read_reports_returns_only_what_exists(tmp_path: Path) -> None:
    _write_report(
        tmp_path,
        "retrieval",
        {"eval": "retrieval", "generated_at": "2026-08-18T03:44:46+00:00", "modes": {"bm25": {}}},
    )
    _write_report(
        tmp_path, "workflow", {"eval": "workflow", "generated_at": "2026-08-18T03:48:38+00:00"}
    )

    payload = read_reports(tmp_path)

    assert set(payload["results"]) == {"retrieval", "workflow"}
    assert payload["results"]["retrieval"]["modes"] == {"bm25": {}}
    assert payload["source_generated_at"]["retrieval"] == "2026-08-18T03:44:46+00:00"
    assert set(payload["missing"]) == set(REPORT_SECTIONS) - {"retrieval", "workflow"}
    assert payload["unreadable"] == []


def test_read_reports_never_substitutes_numbers_for_missing_files(tmp_path: Path) -> None:
    payload = read_reports(tmp_path)
    assert payload["results"] == {}
    assert sorted(payload["missing"]) == sorted(REPORT_SECTIONS)
    assert payload["consolidated_report_available"] is False
    # every absent section is named as skipped, with a reason
    assert sorted(payload["skipped"]) == sorted(
        f"{section} (report not generated)" for section in REPORT_SECTIONS
    )


def test_read_reports_surfaces_the_suite_own_skip_reasons(tmp_path: Path) -> None:
    _write_report(tmp_path, "retrieval", {"eval": "retrieval"})
    (tmp_path / "latest.json").write_text(
        json.dumps({"results": {}, "skipped": ["generation (Ollama unreachable)"]}),
        encoding="utf-8",
    )

    payload = read_reports(tmp_path)

    assert payload["consolidated_report_available"] is True
    assert payload["consolidated_skipped"] == ["generation (Ollama unreachable)"]
    assert payload["source"] == "individual_latest_reports"


def test_read_reports_ignores_an_unreadable_consolidated_report(tmp_path: Path) -> None:
    (tmp_path / "latest.json").write_text("{not json", encoding="utf-8")
    payload = read_reports(tmp_path)
    assert payload["consolidated_skipped"] == []


def test_read_reports_reports_corrupt_files_instead_of_faking_them(tmp_path: Path) -> None:
    (tmp_path / "generation_latest.json").write_text("{not json", encoding="utf-8")
    (tmp_path / "routing_latest.json").write_text("[1, 2, 3]", encoding="utf-8")

    payload = read_reports(tmp_path)

    assert "generation" not in payload["results"]
    assert "routing" not in payload["results"]
    sections = {item["section"] for item in payload["unreadable"]}
    assert sections == {"generation", "routing"}
    assert "generation" not in payload["missing"]


def test_read_reports_tolerates_a_report_without_a_timestamp(tmp_path: Path) -> None:
    _write_report(tmp_path, "extraction", {"eval": "extraction"})
    payload = read_reports(tmp_path)
    assert payload["source_generated_at"]["extraction"] is None


# --------------------------------------------------------------------------
# EvalsRunner
# --------------------------------------------------------------------------


class StubProcess:
    """Stands in for subprocess.Popen; optionally blocks until released."""

    def __init__(
        self,
        *,
        returncode: int = 0,
        stdout: str = "",
        stderr: str = "",
        gate: threading.Event | None = None,
    ) -> None:
        self.returncode: int | None = None
        self._final_returncode = returncode
        self._stdout = stdout
        self._stderr = stderr
        self._gate = gate

    # Argument names mirror subprocess.Popen.communicate.
    def communicate(self, input=None, timeout=None):
        if self._gate is not None:
            self._gate.wait(5)
        self.returncode = self._final_returncode
        return self._stdout, self._stderr


def _inline_executor(work):
    work()
    return None


def test_completed_run_records_process_state_and_no_metrics(tmp_path: Path) -> None:
    calls: list[tuple[list[str], Path]] = []

    def launcher(command, cwd):
        calls.append((list(command), cwd))
        return StubProcess(stdout="- Retrieval: recall 0.93\nReports written", stderr="")

    runner = EvalsRunner(root=tmp_path, launcher=launcher, executor=_inline_executor)
    state = runner.start(cases=3)

    assert calls == [([sys.executable, "-m", "evals.run_all", "--cases", "3"], tmp_path)]
    assert state.status == "completed"
    assert state.returncode == 0
    assert state.completed_at is not None
    assert "Reports written" in state.stdout_tail

    payload = state.to_dict()
    assert set(payload) == {
        "run_id",
        "status",
        "cases",
        "command",
        "started_at",
        "completed_at",
        "returncode",
        "stdout_tail",
        "stderr_tail",
        "errors",
    }
    # the run payload carries no metric keys at all
    forbidden = {"results", "metrics", "recall", "precision", "f1", "accuracy", "latency_ms"}
    assert forbidden.isdisjoint(payload)


def test_nonzero_exit_is_recorded_as_failed(tmp_path: Path) -> None:
    def launcher(command, cwd):
        return StubProcess(returncode=2, stderr="Traceback: benchmark cases not generated")

    runner = EvalsRunner(root=tmp_path, launcher=launcher, executor=_inline_executor)
    state = runner.start(cases=1)

    assert state.status == "failed"
    assert state.returncode == 2
    assert "benchmark cases not generated" in state.stderr_tail
    assert state.errors == ["evals.run_all exited with code 2"]


def test_unavailable_subprocess_is_recorded_as_failed(tmp_path: Path) -> None:
    def launcher(command, cwd):
        raise FileNotFoundError("python interpreter missing")

    runner = EvalsRunner(root=tmp_path, launcher=launcher, executor=_inline_executor)
    state = runner.start()

    assert state.status == "failed"
    assert state.cases == DEFAULT_EVAL_CASES
    assert any("FileNotFoundError" in message for message in state.errors)
    assert state.completed_at is not None
    assert runner.active() is None


def test_output_tail_is_truncated(tmp_path: Path) -> None:
    def launcher(command, cwd):
        return StubProcess(stdout="x" * 5_000)

    runner = EvalsRunner(
        root=tmp_path, launcher=launcher, executor=_inline_executor, tail_chars=100
    )
    state = runner.start(cases=1)
    assert len(state.stdout_tail) == 100


def test_second_run_is_rejected_while_one_is_in_flight(tmp_path: Path) -> None:
    gate = threading.Event()

    def launcher(command, cwd):
        return StubProcess(gate=gate)

    runner = EvalsRunner(root=tmp_path, launcher=launcher)
    first = runner.start(cases=2)
    try:
        with pytest.raises(EvalRunInProgressError) as excinfo:
            runner.start(cases=2)
        assert excinfo.value.status_code == 409
        assert excinfo.value.details["active_run"]["run_id"] == first.run_id
        assert runner.active() is not None
    finally:
        gate.set()
        runner.join(timeout=5)

    assert first.status == "completed"
    assert runner.active() is None

    # once the first run has drained, a new one may start
    second = runner.start(cases=2)
    runner.join(timeout=5)
    assert second.run_id != first.run_id
    assert second.status == "completed"


def test_cases_outside_the_allowed_range_are_rejected(tmp_path: Path) -> None:
    runner = EvalsRunner(root=tmp_path, launcher=lambda c, w: StubProcess())
    for invalid in (0, -1, MAX_EVAL_CASES + 1):
        with pytest.raises(InvalidEvalRunRequestError) as excinfo:
            runner.start(cases=invalid)
        assert excinfo.value.status_code == 422
    assert runner.active() is None


def test_production_launcher_really_reaches_the_evaluation_module() -> None:
    """Spawn the real subprocess with --help: proves argv, cwd and pipes are right."""
    process = _default_launcher([sys.executable, "-m", "evals.run_all", "--help"], repo_root())
    stdout, stderr = process.communicate()
    assert process.returncode == 0, stderr
    assert "--cases" in stdout


def test_lookup_of_unknown_run_raises_not_found(tmp_path: Path) -> None:
    runner = EvalsRunner(root=tmp_path, launcher=lambda c, w: StubProcess())
    with pytest.raises(EvalRunNotFoundError) as excinfo:
        runner.get("does-not-exist")
    assert excinfo.value.status_code == 404


def test_runs_are_retrievable_by_id_and_as_latest(tmp_path: Path) -> None:
    runner = EvalsRunner(
        root=tmp_path, launcher=lambda c, w: StubProcess(), executor=_inline_executor
    )
    state = runner.start(cases=1)
    assert runner.get(state.run_id) is state
    assert runner.latest() is state
    assert runner.active() is None
