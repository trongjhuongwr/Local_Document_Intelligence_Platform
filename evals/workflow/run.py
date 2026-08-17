"""Eval 6 — end-to-end workflow success on the benchmark.

Runs the real LangGraph compare workflow (LLM extraction included) per case
and measures completion, extraction failure rate, review-task creation
accuracy (tasks are created exactly when findings exist), and duration
percentiles. This is the same path the /compare endpoint runs.
"""

import argparse
import asyncio
import statistics
from pathlib import Path
from typing import Any

from app.api.dependencies import get_compare_service
from app.core.exceptions import OllamaUnavailableError
from evals.common import load_benchmark_cases, markdown_table, write_report
from evals.retrieval.run import ensure_corpus


async def run_workflow_eval(
    max_cases: int | None = None,
    benchmark_dir: Path | None = None,
    write: bool = True,
) -> dict[str, Any]:
    cases = load_benchmark_cases(benchmark_dir)
    if max_cases is not None:
        cases = cases[:max_cases]

    # Idempotently ingest the benchmark corpus so every case has parsed documents.
    await ensure_corpus(cases, benchmark_dir)
    service = get_compare_service()

    completed = 0
    failed = 0
    extraction_failures = 0
    documents_processed = 0
    review_creation_correct = 0
    durations: list[float] = []
    failures_detail: list[dict[str, Any]] = []

    for case in cases:
        try:
            result = await service.run(case_id=case.case_id)
        except Exception as exc:
            failed += 1
            failures_detail.append({"case": case.case_id, "error": type(exc).__name__})
            continue
        if result["status"] == "completed":
            completed += 1
        else:
            failed += 1
            failures_detail.append({"case": case.case_id, "error": result.get("errors")})
        durations.append(result["duration_ms"])
        report = result.get("report", {})
        extraction_failures += len(report.get("extraction_failures", []))
        documents_processed += len(report.get("documents_analyzed", []))
        has_findings = bool(result.get("discrepancies"))
        has_tasks = bool(result.get("review_task_ids"))
        if has_findings == has_tasks:
            review_creation_correct += 1

    total = len(cases)
    payload: dict[str, Any] = {
        "cases": total,
        "completed": completed,
        "failed": failed,
        "completion_rate": round(completed / total, 4) if total else 0.0,
        "documents_processed": documents_processed,
        "extraction_failure_count": extraction_failures,
        "extraction_failure_rate": round(extraction_failures / documents_processed, 4)
        if documents_processed
        else 0.0,
        "review_task_creation_accuracy": round(review_creation_correct / total, 4)
        if total
        else 0.0,
        "median_duration_ms": round(statistics.median(durations), 1) if durations else None,
        "p95_duration_ms": round(statistics.quantiles(durations, n=20)[18], 1)
        if len(durations) >= 20
        else None,
        "failures": failures_detail[:20],
        "headline": (
            f"workflow completion {completed}/{total}, review-task creation accuracy "
            f"{review_creation_correct / total:.0%}"
            if total
            else "no cases"
        ),
    }

    markdown = "# Workflow Success Evaluation (end-to-end /compare path)\n\n" + markdown_table(
        ["Metric", "Value"],
        [
            ["Cases", str(total)],
            ["Completed", str(completed)],
            ["Failed", str(failed)],
            ["Completion rate", f"{payload['completion_rate']:.2%}"],
            ["Documents processed", str(documents_processed)],
            ["Extraction failure rate", f"{payload['extraction_failure_rate']:.2%}"],
            [
                "Review-task creation accuracy",
                f"{payload['review_task_creation_accuracy']:.2%}",
            ],
            ["Median duration", f"{payload['median_duration_ms']} ms"],
            ["P95 duration", f"{payload['p95_duration_ms']} ms"],
        ],
    )
    if write:
        write_report("workflow", payload, markdown)
    return payload


async def run_for_run_all(max_cases: int | None) -> dict[str, Any]:
    return await run_workflow_eval(max_cases=max_cases)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the workflow-success evaluation.")
    parser.add_argument("--cases", type=int, default=None)
    args = parser.parse_args(argv)
    try:
        payload = asyncio.run(run_workflow_eval(max_cases=args.cases))
    except OllamaUnavailableError as exc:
        print(f"SKIPPED: {exc}")
        return 1
    print(payload["headline"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
