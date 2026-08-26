"""Single-command evaluation runner: ``python -m evals.run_all``.

Runs every evaluation that can run in the current environment and writes
consolidated reports to ``evals/reports/latest.{json,md}``. Evaluations that
need a live Ollama are skipped (with an explicit note) when it is
unreachable, so the deterministic evals still run in CI.

Registered optional eval modules expose
``async def run_for_run_all(max_cases) -> dict``.
"""

import argparse
import asyncio
import importlib
import json
from typing import Any

from evals.common import REPORTS_DIR, ollama_available
from evals.discrepancy.run import run_discrepancy_eval
from evals.extraction.run import ExtractionCache, run_extraction_eval

_OPTIONAL_EVALS = [
    ("evals.retrieval.run", "retrieval"),
    ("evals.routing.run", "routing"),
    ("evals.generation.run", "generation"),
    ("evals.workflow.run", "workflow"),
]

_EXISTING_REPORTS = {
    "discrepancy_rules": "discrepancy_rules_latest.json",
    "extraction": "extraction_latest.json",
    "discrepancy_end_to_end": "discrepancy_end_to_end_latest.json",
    "retrieval": "retrieval_latest.json",
    "routing": "routing_latest.json",
    "generation": "generation_latest.json",
    "workflow": "workflow_latest.json",
}


async def run_all(max_cases: int | None, skip_llm: bool) -> dict[str, Any]:
    results: dict[str, Any] = {}
    skipped: list[str] = []

    results["discrepancy_rules"] = await run_discrepancy_eval("rules", max_cases=max_cases)

    llm_ready = False if skip_llm else await ollama_available()
    if llm_ready:
        extraction_cache: ExtractionCache = {}
        results["extraction"] = await run_extraction_eval(
            max_cases=max_cases, extraction_cache=extraction_cache
        )
        results["discrepancy_end_to_end"] = await run_discrepancy_eval(
            "end_to_end", max_cases=max_cases, extraction_cache=extraction_cache
        )
    else:
        reason = "--skip-llm" if skip_llm else "Ollama unreachable"
        skipped.extend([f"extraction ({reason})", f"discrepancy_end_to_end ({reason})"])

    for module_name, key in _OPTIONAL_EVALS:
        if skip_llm:
            skipped.append(f"{key} (--skip-llm)")
            continue
        try:
            module = importlib.import_module(module_name)
        except ModuleNotFoundError:
            continue
        runner = getattr(module, "run_for_run_all", None)
        if runner is None:
            continue
        try:
            results[key] = await runner(max_cases)
        except Exception as exc:
            skipped.append(f"{key} (failed: {type(exc).__name__}: {exc})")

    return {"results": results, "skipped": skipped}


def _headline(results: dict[str, Any]) -> list[str]:
    lines = []
    rules = results.get("discrepancy_rules")
    if rules:
        lines.append(
            f"- Discrepancy rules (perfect extraction): "
            f"F1 **{rules['overall']['f1']:.2%}** over {rules['cases_evaluated']} cases"
        )
    extraction = results.get("extraction")
    if extraction:
        lines.append(
            f"- Extraction ({extraction.get('model', 'unknown model')}): field accuracy "
            f"**{extraction['overall_field_accuracy']:.2%}**, schema validity "
            f"**{extraction['overall_schema_valid_rate']:.2%}**"
        )
    e2e = results.get("discrepancy_end_to_end")
    if e2e:
        lines.append(
            f"- Discrepancy end-to-end (LLM extraction): precision "
            f"**{e2e['overall']['precision']:.2%}**, recall "
            f"**{e2e['overall']['recall']:.2%}**, F1 **{e2e['overall']['f1']:.2%}**"
        )
    for key in ("retrieval", "routing", "generation", "workflow"):
        payload = results.get(key)
        if isinstance(payload, dict) and "headline" in payload:
            lines.append(f"- {key.capitalize()}: {payload['headline']}")
    return lines


def consolidate_existing_reports() -> dict[str, Any]:
    """Build latest.{json,md} from the newest individual report artifacts."""
    results: dict[str, Any] = {}
    skipped: list[str] = []
    source_timestamps: dict[str, str | None] = {}
    for key, filename in _EXISTING_REPORTS.items():
        path = REPORTS_DIR / filename
        if not path.is_file():
            skipped.append(f"{key} (report missing)")
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            skipped.append(f"{key} (invalid report payload)")
            continue
        source_timestamps[key] = payload.get("generated_at")
        results[key] = payload
    return {
        "results": results,
        "skipped": skipped,
        "source": "individual_latest_reports",
        "source_generated_at": source_timestamps,
    }


def write_consolidated(outcome: dict[str, Any]) -> None:
    """Persist the consolidated machine-readable and human-readable summary."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (REPORTS_DIR / "latest.json").write_text(json.dumps(outcome, indent=2) + "\n", encoding="utf-8")
    headline = _headline(outcome["results"])
    markdown_lines = ["# Evaluation Summary", "", *headline]
    if outcome.get("source_generated_at"):
        markdown_lines += ["", "Source report timestamps:"]
        markdown_lines += [
            f"- {key}: {timestamp}" for key, timestamp in outcome["source_generated_at"].items()
        ]
    if outcome["skipped"]:
        markdown_lines += ["", "Skipped:", *[f"- {item}" for item in outcome["skipped"]]]
    markdown_lines += [
        "",
        "Detailed per-eval reports live next to this file as `*_latest.{json,md}`.",
    ]
    (REPORTS_DIR / "latest.md").write_text("\n".join(markdown_lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run all evaluations.")
    parser.add_argument("--cases", type=int, default=None, help="limit benchmark cases")
    parser.add_argument(
        "--skip-llm", action="store_true", help="run only deterministic evaluations"
    )
    parser.add_argument(
        "--consolidate-existing",
        action="store_true",
        help="rebuild latest reports from existing individual *_latest.json artifacts",
    )
    args = parser.parse_args(argv)

    outcome = (
        consolidate_existing_reports()
        if args.consolidate_existing
        else asyncio.run(run_all(max_cases=args.cases, skip_llm=args.skip_llm))
    )
    write_consolidated(outcome)

    headline = _headline(outcome["results"])
    print("\n".join(line.replace("**", "") for line in headline))
    if outcome["skipped"]:
        print("Skipped: " + "; ".join(outcome["skipped"]))
    print(f"Reports written to {REPORTS_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
