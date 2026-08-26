"""Read real evaluation reports and launch the real evaluation suite.

Two responsibilities, both deliberately metric-free at the edges:

* :func:`read_reports` returns the JSON artefacts that ``python -m evals.run_all``
  actually wrote to ``evals/reports``. A report that is not on disk is listed in
  ``missing`` — it is never replaced with placeholder numbers.
* :class:`EvalsRunner` starts ``python -m evals.run_all --cases N`` as a real
  subprocess and tracks only process state (status, exit code, output tail).
  It never parses, summarises or returns metrics; refreshed numbers reach the
  client through ``read_reports`` once the run has rewritten the files.
"""

from __future__ import annotations

import json
import subprocess
import sys
import threading
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

from app.core.exceptions import AppError
from app.core.logging import get_logger

logger = get_logger(__name__)

REPORT_SECTIONS: tuple[str, ...] = (
    "extraction",
    "retrieval",
    "routing",
    "discrepancy_rules",
    "discrepancy_end_to_end",
    "generation",
    "workflow",
)
"""Individual ``*_latest.json`` reports the evaluation suite writes."""

CONSOLIDATED_REPORT = "latest.json"

MIN_EVAL_CASES = 1
MAX_EVAL_CASES = 30
DEFAULT_EVAL_CASES = 5
"""A full LLM run takes ~15+ minutes, so the API default stays small."""

RUN_STATUSES = ("queued", "running", "completed", "failed")
_ACTIVE_STATUSES = frozenset({"queued", "running"})


class EvalRunInProgressError(AppError):
    status_code = 409
    error_code = "eval_run_in_progress"


class EvalRunNotFoundError(AppError):
    status_code = 404
    error_code = "eval_run_not_found"


class InvalidEvalRunRequestError(AppError):
    status_code = 422
    error_code = "invalid_eval_run_request"


def repo_root() -> Path:
    """The directory that owns ``evals/`` — three levels up from this module."""
    return Path(__file__).resolve().parents[2]


def default_reports_dir() -> Path:
    return repo_root() / "evals" / "reports"


def _now() -> str:
    return datetime.now(UTC).isoformat()


# --------------------------------------------------------------------------
# Reading the reports the suite really produced
# --------------------------------------------------------------------------


def _consolidated_skipped(directory: Path) -> list[str]:
    """The ``skipped`` notes ``evals.run_all`` recorded, when latest.json is readable."""
    path = directory / CONSOLIDATED_REPORT
    if not path.is_file():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(payload, dict):
        return []
    skipped = payload.get("skipped")
    return [str(item) for item in skipped] if isinstance(skipped, list) else []


def read_reports(reports_dir: Path | None = None) -> dict[str, Any]:
    """Load every ``<section>_latest.json`` that exists; report the rest as missing."""
    directory = reports_dir or default_reports_dir()
    results: dict[str, Any] = {}
    missing: list[str] = []
    unreadable: list[dict[str, str]] = []
    source_generated_at: dict[str, str | None] = {}
    skipped: list[str] = []

    for section in REPORT_SECTIONS:
        path = directory / f"{section}_latest.json"
        if not path.is_file():
            missing.append(section)
            skipped.append(f"{section} (report not generated)")
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            reason = f"{type(exc).__name__}: {exc}"
            unreadable.append({"section": section, "error": reason})
            skipped.append(f"{section} (report unreadable: {reason})")
            continue
        if not isinstance(payload, dict):
            reason = "report is not a JSON object"
            unreadable.append({"section": section, "error": reason})
            skipped.append(f"{section} ({reason})")
            continue
        results[section] = payload
        raw_timestamp = payload.get("generated_at")
        source_generated_at[section] = raw_timestamp if isinstance(raw_timestamp, str) else None

    return {
        "results": results,
        "missing": missing,
        "unreadable": unreadable,
        "skipped": skipped,
        "source": "individual_latest_reports",
        "source_generated_at": source_generated_at,
        # Why the last real run skipped an eval (e.g. "retrieval (Ollama unreachable)").
        "consolidated_skipped": _consolidated_skipped(directory),
        "sections": list(REPORT_SECTIONS),
        "reports_dir": str(directory),
        "consolidated_report_available": (directory / CONSOLIDATED_REPORT).is_file(),
    }


# --------------------------------------------------------------------------
# Running the suite for real
# --------------------------------------------------------------------------


class SubprocessHandle(Protocol):
    """Minimal surface of :class:`subprocess.Popen` the runner depends on."""

    returncode: int | None

    def communicate(
        self, input: str | None = ..., timeout: float | None = ...
    ) -> tuple[str, str]: ...


Launcher = Callable[[Sequence[str], Path], SubprocessHandle]
Executor = Callable[[Callable[[], None]], "threading.Thread | None"]


@dataclass
class EvalRunState:
    """Process state only — never metrics."""

    run_id: str
    cases: int
    command: list[str]
    status: str = "queued"
    started_at: str = field(default_factory=_now)
    completed_at: str | None = None
    returncode: int | None = None
    stdout_tail: str = ""
    stderr_tail: str = ""
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "status": self.status,
            "cases": self.cases,
            "command": list(self.command),
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "returncode": self.returncode,
            "stdout_tail": self.stdout_tail,
            "stderr_tail": self.stderr_tail,
            "errors": list(self.errors),
        }


def _default_launcher(command: Sequence[str], cwd: Path) -> SubprocessHandle:
    # Fixed argv built from sys.executable; never a shell string.
    return subprocess.Popen(
        list(command),
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def _default_executor(work: Callable[[], None]) -> threading.Thread:
    thread = threading.Thread(target=work, name="evals-runner", daemon=True)
    thread.start()
    return thread


class EvalsRunner:
    """Single-flight launcher for ``python -m evals.run_all``."""

    def __init__(
        self,
        *,
        root: Path | None = None,
        launcher: Launcher | None = None,
        executor: Executor | None = None,
        tail_chars: int = 4_000,
    ) -> None:
        self._root = root or repo_root()
        self._launcher = launcher or _default_launcher
        self._executor = executor or _default_executor
        self._tail_chars = tail_chars
        self._lock = threading.Lock()
        self._runs: dict[str, EvalRunState] = {}
        self._active: EvalRunState | None = None
        self._latest: EvalRunState | None = None
        self._thread: threading.Thread | None = None

    # -- inspection --------------------------------------------------------

    def active(self) -> EvalRunState | None:
        with self._lock:
            return self._active

    def latest(self) -> EvalRunState | None:
        with self._lock:
            return self._latest

    def get(self, run_id: str) -> EvalRunState:
        with self._lock:
            state = self._runs.get(run_id)
        if state is None:
            raise EvalRunNotFoundError(f"Evaluation run {run_id} not found")
        return state

    def join(self, timeout: float | None = None) -> None:
        """Wait for the worker thread; used by tests, not by request handlers."""
        thread = self._thread
        if thread is not None:
            thread.join(timeout)

    # -- launching ---------------------------------------------------------

    def build_command(self, cases: int) -> list[str]:
        return [sys.executable, "-m", "evals.run_all", "--cases", str(cases)]

    def start(self, cases: int = DEFAULT_EVAL_CASES) -> EvalRunState:
        if not MIN_EVAL_CASES <= cases <= MAX_EVAL_CASES:
            raise InvalidEvalRunRequestError(
                f"cases must be between {MIN_EVAL_CASES} and {MAX_EVAL_CASES}",
                details={"given": cases},
            )
        with self._lock:
            if self._active is not None and self._active.status in _ACTIVE_STATUSES:
                raise EvalRunInProgressError(
                    "An evaluation run is already in flight",
                    details={"active_run": self._active.to_dict()},
                )
            state = EvalRunState(
                run_id=uuid.uuid4().hex,
                cases=cases,
                command=self.build_command(cases),
            )
            self._runs[state.run_id] = state
            self._active = state
            self._latest = state
        logger.info("eval_run_queued", run_id=state.run_id, cases=cases)
        self._thread = self._executor(lambda: self._execute(state))
        return state

    # -- worker ------------------------------------------------------------

    def _tail(self, text: str | None) -> str:
        if not text:
            return ""
        return text[-self._tail_chars :]

    def _fail(self, state: EvalRunState, event: str, message: str) -> None:
        state.status = "failed"
        state.errors.append(message)
        logger.warning(event, run_id=state.run_id, error=message)

    def _execute(self, state: EvalRunState) -> None:
        try:
            state.status = "running"
            try:
                process = self._launcher(state.command, self._root)
            except Exception as exc:  # subprocess unavailable, bad interpreter, ...
                self._fail(
                    state,
                    "eval_run_launch_failed",
                    f"Failed to launch evaluation suite: {type(exc).__name__}: {exc}",
                )
                return
            try:
                stdout, stderr = process.communicate()
            except Exception as exc:
                self._fail(
                    state,
                    "eval_run_aborted",
                    f"Evaluation suite aborted: {type(exc).__name__}: {exc}",
                )
                return
            state.stdout_tail = self._tail(stdout)
            state.stderr_tail = self._tail(stderr)
            returncode = process.returncode
            state.returncode = returncode
            if returncode == 0:
                state.status = "completed"
            else:
                self._fail(
                    state,
                    "eval_run_failed",
                    f"evals.run_all exited with code {returncode}",
                )
            logger.info("eval_run_finished", run_id=state.run_id, status=state.status)
        finally:
            state.completed_at = _now()
            with self._lock:
                if self._active is state:
                    self._active = None
