"""Eval 1 — structured extraction accuracy against DocFlowBench ground truth.

Runs the real extraction pipeline (PDF text -> local LLM structured output)
over every benchmark document and scores each field against ground truth.
Documents whose extraction fails schema validation count every field as
incorrect — the report reflects end-to-end pipeline reality, not just the
happy path.
"""

import argparse
import asyncio
import statistics
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

import pymupdf

from app.core.config import get_settings
from app.core.exceptions import OllamaUnavailableError, StructuredOutputValidationError
from app.discrepancy.normalize import (
    normalize_company_name,
    normalize_currency,
    normalize_payment_terms,
)
from app.extraction.service import ExtractionOutcome, ExtractionService
from app.llm.ollama import OllamaLLMProvider
from evals.common import (
    case_documents_dir,
    load_benchmark_cases,
    markdown_table,
    write_report,
)
from synthetic_data.generator.models import BenchmarkCase

# (field, comparator) per document type; comparators decide what "correct" means.
FIELD_SPECS: dict[str, list[tuple[str, str]]] = {
    "invoice": [
        ("invoice_number", "str"),
        ("vendor_name", "company"),
        ("customer_name", "company"),
        ("issue_date", "date"),
        ("due_date", "date"),
        ("currency", "currency"),
        ("subtotal", "money"),
        ("tax_rate_percent", "money"),
        ("tax", "money"),
        ("total", "money"),
        ("payment_terms", "terms"),
        ("po_reference", "str"),
    ],
    "contract": [
        ("vendor_name", "company"),
        ("customer_name", "company"),
        ("effective_date", "date"),
        ("expiration_date", "date"),
        ("currency", "currency"),
        ("maximum_amount", "money"),
        ("payment_terms", "terms"),
    ],
    "purchase_order": [
        ("po_number", "str"),
        ("vendor_name", "company"),
        ("issue_date", "date"),
        ("currency", "currency"),
        ("approved_amount", "money"),
    ],
    "policy": [
        ("required_payment_terms", "terms"),
        ("po_reference_required", "bool"),
        ("manual_approval_threshold", "money"),
        ("currency", "currency"),
    ],
}

_NUMERIC_KINDS = {"money"}
_DATE_KINDS = {"date"}


ExtractionCache = dict[tuple[str, str, str], ExtractionOutcome | None]


def pdf_text(path: Path) -> str:
    with pymupdf.open(path) as document:
        return "\n".join(page.get_text() for page in document)


def values_match(kind: str, truth: Any, predicted: Any) -> bool:
    if truth is None and predicted is None:
        return True
    if truth is None or predicted is None:
        return False
    if kind == "money":
        return abs(float(truth) - float(predicted)) <= 0.01
    if kind == "date":
        return date.fromisoformat(str(truth)) == date.fromisoformat(str(predicted))
    if kind == "company":
        return normalize_company_name(str(truth)) == normalize_company_name(str(predicted))
    if kind == "currency":
        return normalize_currency(str(truth)) == normalize_currency(str(predicted))
    if kind == "terms":
        return normalize_payment_terms(str(truth)) == normalize_payment_terms(str(predicted))
    if kind == "bool":
        return bool(truth) is bool(predicted)
    return " ".join(str(truth).lower().split()) == " ".join(str(predicted).lower().split())


def _case_documents(case: BenchmarkCase) -> list[tuple[str, str, Any]]:
    """(document_type, filename, ground_truth_object) for each PDF in the case."""
    documents: list[tuple[str, str, Any]] = [
        ("contract", "service_contract.pdf", case.contract),
        ("purchase_order", "purchase_order.pdf", case.purchase_order),
        ("policy", "payment_policy.pdf", case.policy),
    ]
    documents.extend(("invoice", invoice.filename, invoice) for invoice in case.invoices)
    return documents


async def run_extraction_eval(
    max_cases: int | None = None,
    benchmark_dir: Path | None = None,
    extraction_cache: ExtractionCache | None = None,
) -> dict[str, Any]:
    cases = load_benchmark_cases(benchmark_dir)
    if max_cases is not None:
        cases = cases[:max_cases]

    service = ExtractionService(OllamaLLMProvider())

    field_totals: dict[str, dict[str, list[bool]]] = defaultdict(lambda: defaultdict(list))
    kind_totals: dict[str, dict[str, list[bool]]] = defaultdict(lambda: defaultdict(list))
    completeness: dict[str, list[bool]] = defaultdict(list)
    schema_attempts: dict[str, int] = defaultdict(int)
    schema_valid: dict[str, int] = defaultdict(int)
    latencies_ms: list[float] = []

    for case in cases:
        docs_dir = case_documents_dir(case, benchmark_dir)
        for document_type, filename, truth in _case_documents(case):
            text = pdf_text(docs_dir / filename)
            cache_key = (case.case_id, document_type, filename)
            schema_attempts[document_type] += 1
            try:
                outcome = await service.extract(document_type, text)
            except StructuredOutputValidationError:
                if extraction_cache is not None:
                    extraction_cache[cache_key] = None
                for field, kind in FIELD_SPECS[document_type]:
                    field_totals[document_type][field].append(False)
                    kind_totals[document_type][kind].append(False)
                    if getattr(truth, field, None) is not None:
                        completeness[document_type].append(False)
                continue
            if extraction_cache is not None:
                extraction_cache[cache_key] = outcome
            schema_valid[document_type] += 1
            if outcome.telemetry.total_duration_ms is not None:
                latencies_ms.append(outcome.telemetry.total_duration_ms)
            for field, kind in FIELD_SPECS[document_type]:
                truth_value = getattr(truth, field, None)
                predicted_value = getattr(outcome.data, field, None)
                correct = values_match(kind, truth_value, predicted_value)
                field_totals[document_type][field].append(correct)
                kind_totals[document_type][kind].append(correct)
                if truth_value is not None:
                    completeness[document_type].append(predicted_value is not None)

    def _rate(values: list[bool]) -> float:
        return round(sum(values) / len(values), 4) if values else 0.0

    per_type: dict[str, Any] = {}
    for document_type in FIELD_SPECS:
        if schema_attempts[document_type] == 0:
            continue
        fields = {field: _rate(results) for field, results in field_totals[document_type].items()}
        all_results = [r for results in field_totals[document_type].values() for r in results]
        per_type[document_type] = {
            "documents": schema_attempts[document_type],
            "schema_valid_rate": round(
                schema_valid[document_type] / schema_attempts[document_type], 4
            ),
            "field_accuracy": fields,
            "overall_field_accuracy": _rate(all_results),
            "numeric_accuracy": _rate(
                [r for kind in _NUMERIC_KINDS for r in kind_totals[document_type].get(kind, [])]
            ),
            "date_accuracy": _rate(
                [r for kind in _DATE_KINDS for r in kind_totals[document_type].get(kind, [])]
            ),
            "required_field_completeness": _rate(completeness[document_type]),
        }

    all_field_results = [
        r
        for document_type in per_type
        for results in field_totals[document_type].values()
        for r in results
    ]
    payload: dict[str, Any] = {
        "cases_evaluated": len(cases),
        "model": get_settings().ollama_llm_model,
        "overall_field_accuracy": _rate(all_field_results),
        "overall_schema_valid_rate": round(
            sum(schema_valid.values()) / max(1, sum(schema_attempts.values())), 4
        ),
        "median_llm_latency_ms": round(statistics.median(latencies_ms), 1)
        if latencies_ms
        else None,
        "p95_llm_latency_ms": round(statistics.quantiles(latencies_ms, n=20)[18], 1)
        if len(latencies_ms) >= 20
        else None,
        "by_document_type": per_type,
    }

    rows = [
        [
            document_type,
            str(stats["documents"]),
            f"{stats['schema_valid_rate']:.2%}",
            f"{stats['overall_field_accuracy']:.2%}",
            f"{stats['numeric_accuracy']:.2%}",
            f"{stats['date_accuracy']:.2%}",
            f"{stats['required_field_completeness']:.2%}",
        ]
        for document_type, stats in per_type.items()
    ]
    markdown = (
        "# Extraction Evaluation (DocFlowBench)\n\n"
        f"Model: `{payload['model']}` · Cases: {len(cases)} · "
        f"Overall field accuracy: **{payload['overall_field_accuracy']:.2%}** · "
        f"Schema validity: **{payload['overall_schema_valid_rate']:.2%}**\n\n"
        + markdown_table(
            [
                "Document type",
                "Docs",
                "Schema valid",
                "Field accuracy",
                "Numeric",
                "Dates",
                "Completeness",
            ],
            rows,
        )
    )
    write_report("extraction", payload, markdown)
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the structured extraction evaluation.")
    parser.add_argument("--cases", type=int, default=None, help="limit number of cases")
    args = parser.parse_args(argv)
    try:
        payload = asyncio.run(run_extraction_eval(max_cases=args.cases))
    except OllamaUnavailableError as exc:
        print(f"SKIPPED: {exc}")
        return 1
    print(
        f"Extraction eval complete: field accuracy "
        f"{payload['overall_field_accuracy']:.2%} over {payload['cases_evaluated']} cases"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
