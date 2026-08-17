"""Eval 5 — citation quality of the end-to-end grounded Q&A pipeline.

Runs the real stack (deterministic routing, hybrid retrieval over pgvector,
llama3.2:1b synthesis, deterministic citation verification) on the benchmark
query set and measures whether answers cite, whether citations resolve, and
whether they point at the right document. Latency percentiles double as the
performance evaluation for the Q&A path.
"""

import argparse
import asyncio
import statistics
from pathlib import Path
from typing import Any

from app.core.exceptions import OllamaUnavailableError
from app.llm.ollama import OllamaLLMProvider
from app.retrieval.base import SearchFilters
from app.retrieval.service import RetrievalService
from app.services.qa import QAService
from evals.common import load_benchmark_cases, markdown_table, write_report
from evals.retrieval.run import build_queries, ensure_corpus


async def run_generation_eval(
    max_cases: int | None = None,
    benchmark_dir: Path | None = None,
    write: bool = True,
) -> dict[str, Any]:
    cases = load_benchmark_cases(benchmark_dir)
    if max_cases is not None:
        cases = cases[:max_cases]

    await ensure_corpus(cases, benchmark_dir)
    service = QAService(OllamaLLMProvider(), RetrievalService())

    total = 0
    with_citations = 0
    valid_citations = 0
    correct_document = 0
    no_evidence = 0
    latencies: list[float] = []
    examples: list[dict[str, Any]] = []

    for case in cases:
        for eval_query in build_queries(case):
            result = await service.answer(
                eval_query.query,
                filters=SearchFilters(case_id=case.case_id),
            )
            total += 1
            latencies.append(result.latency_ms)
            if result.verification is None:
                no_evidence += 1
                continue
            used = result.verification.used_citation_ids
            if used:
                with_citations += 1
            if result.verification.valid and used:
                valid_citations += 1
            cited_files = {
                result.citations[cid].filename for cid in used if cid in result.citations
            }
            if eval_query.expected_filename in cited_files:
                correct_document += 1
            elif len(examples) < 10:
                examples.append(
                    {
                        "case": case.case_id,
                        "query": eval_query.query,
                        "expected": eval_query.expected_filename,
                        "cited": sorted(cited_files),
                    }
                )

    def _rate(count: int) -> float:
        return round(count / total, 4) if total else 0.0

    payload: dict[str, Any] = {
        "model": "llama3.2:1b",
        "queries": total,
        "citation_presence_rate": _rate(with_citations),
        "valid_citation_rate": _rate(valid_citations),
        "correct_document_rate": _rate(correct_document),
        "no_evidence_rate": _rate(no_evidence),
        "median_latency_ms": round(statistics.median(latencies), 1) if latencies else None,
        "p95_latency_ms": round(statistics.quantiles(latencies, n=20)[18], 1)
        if len(latencies) >= 20
        else None,
        "note": (
            "Unsupported-claim detection beyond citation resolution requires manual "
            "review; a sample of answers is stored in query_runs for inspection."
        ),
        "miscited_examples": examples,
        "headline": (
            f"citations present {with_citations / total:.0%}, valid "
            f"{valid_citations / total:.0%}, correct document "
            f"{correct_document / total:.0%} over {total} queries"
        )
        if total
        else "no queries executed",
    }

    markdown = (
        "# Citation Quality Evaluation (end-to-end Q&A)\n\n"
        f"Queries: {total} · "
        + " · ".join(
            f"{label}: **{payload[key]:.2%}**"
            for label, key in [
                ("Citations present", "citation_presence_rate"),
                ("Citations valid", "valid_citation_rate"),
                ("Correct document cited", "correct_document_rate"),
            ]
        )
        + f"\n\nMedian latency: {payload['median_latency_ms']} ms · "
        f"P95: {payload['p95_latency_ms']} ms\n\n"
        + (
            markdown_table(
                ["Case", "Expected", "Cited"],
                [[e["case"], e["expected"], ", ".join(e["cited"]) or "(none)"] for e in examples],
            )
            if examples
            else "No mis-cited examples in this run."
        )
    )
    if write:
        write_report("generation", payload, markdown)
    return payload


async def run_for_run_all(max_cases: int | None) -> dict[str, Any]:
    return await run_generation_eval(max_cases=max_cases)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the citation-quality evaluation.")
    parser.add_argument("--cases", type=int, default=None)
    args = parser.parse_args(argv)
    try:
        payload = asyncio.run(run_generation_eval(max_cases=args.cases))
    except OllamaUnavailableError as exc:
        print(f"SKIPPED: {exc}")
        return 1
    print(payload["headline"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
