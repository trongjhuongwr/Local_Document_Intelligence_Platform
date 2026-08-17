"""Eval 4 — discrepancy detection precision/recall/F1 against DocFlowBench.

Two modes:

- ``rules``: feeds ground-truth values through the deterministic engine
  (perfect-extraction upper bound; validates that the rules and the benchmark
  taxonomy agree).
- ``end_to_end``: extracts every document with the real LLM pipeline first,
  then runs the engine on what the model actually extracted. This is the
  headline number — extraction errors propagate into detection errors.
"""

import argparse
import asyncio
from collections import defaultdict
from pathlib import Path
from typing import Any

from app.core.exceptions import OllamaUnavailableError, StructuredOutputValidationError
from app.discrepancy.engine import analyze_case
from app.discrepancy.models import CaseDocuments, InvoiceRecord
from app.extraction.schemas import (
    ContractExtraction,
    InvoiceExtraction,
    PolicyExtraction,
    PurchaseOrderExtraction,
)
from app.extraction.service import ExtractionService
from app.llm.ollama import OllamaLLMProvider
from evals.common import (
    case_documents_dir,
    load_benchmark_cases,
    markdown_table,
    precision_recall_f1,
    write_report,
)
from evals.extraction.run import pdf_text
from synthetic_data.generator.models import BenchmarkCase


def perfect_case_documents(case: BenchmarkCase) -> CaseDocuments:
    """Copy ground truth into extraction schemas (simulates a perfect extractor)."""
    return CaseDocuments(
        contract=ContractExtraction(**case.contract.model_dump()),
        purchase_order=PurchaseOrderExtraction(**case.purchase_order.model_dump()),
        policy=PolicyExtraction(**case.policy.model_dump(exclude={"customer_name"})),
        invoices=[
            InvoiceRecord(
                extraction=InvoiceExtraction(
                    **invoice.model_dump(exclude={"filename", "line_items"})
                ),
                filename=invoice.filename,
            )
            for invoice in case.invoices
        ],
    )


async def extracted_case_documents(
    service: ExtractionService, case: BenchmarkCase, benchmark_dir: Path | None
) -> CaseDocuments:
    """Extract every case PDF with the LLM pipeline; failed docs become None."""
    docs_dir = case_documents_dir(case, benchmark_dir)

    async def _extract(document_type: str, filename: str) -> Any:
        try:
            outcome = await service.extract(document_type, pdf_text(docs_dir / filename))
        except StructuredOutputValidationError:
            return None
        return outcome.data

    contract = await _extract("contract", "service_contract.pdf")
    purchase_order = await _extract("purchase_order", "purchase_order.pdf")
    policy = await _extract("policy", "payment_policy.pdf")
    invoices = []
    for invoice in case.invoices:
        extraction = await _extract("invoice", invoice.filename)
        if extraction is not None:
            invoices.append(InvoiceRecord(extraction=extraction, filename=invoice.filename))
    return CaseDocuments(
        contract=contract, purchase_order=purchase_order, policy=policy, invoices=invoices
    )


def _score(
    cases: list[BenchmarkCase], predictions: list[set[tuple[str, str | None]]]
) -> dict[str, Any]:
    tp_by_type: dict[str, int] = defaultdict(int)
    fp_by_type: dict[str, int] = defaultdict(int)
    fn_by_type: dict[str, int] = defaultdict(int)
    mismatches: list[dict[str, Any]] = []

    for case, found in zip(cases, predictions, strict=True):
        expected = {(a.type.value, a.invoice_number) for a in case.expected_anomalies}
        for anomaly_type, _invoice_number in found & expected:
            tp_by_type[anomaly_type] += 1
        for anomaly_type, _invoice_number in found - expected:
            fp_by_type[anomaly_type] += 1
            mismatches.append(
                {"case": case.case_id, "kind": "false_positive", "type": anomaly_type}
            )
        for anomaly_type, _invoice_number in expected - found:
            fn_by_type[anomaly_type] += 1
            mismatches.append(
                {"case": case.case_id, "kind": "false_negative", "type": anomaly_type}
            )

    all_types = sorted(set(tp_by_type) | set(fp_by_type) | set(fn_by_type))
    by_type = {
        anomaly_type: {
            "tp": tp_by_type[anomaly_type],
            "fp": fp_by_type[anomaly_type],
            "fn": fn_by_type[anomaly_type],
            **precision_recall_f1(
                tp_by_type[anomaly_type], fp_by_type[anomaly_type], fn_by_type[anomaly_type]
            ),
        }
        for anomaly_type in all_types
    }
    tp, fp, fn = sum(tp_by_type.values()), sum(fp_by_type.values()), sum(fn_by_type.values())
    total_expected = sum(len(c.expected_anomalies) for c in cases)
    return {
        "cases_evaluated": len(cases),
        "expected_anomalies": total_expected,
        "overall": {"tp": tp, "fp": fp, "fn": fn, **precision_recall_f1(tp, fp, fn)},
        "by_type": by_type,
        "mismatches": mismatches[:50],
    }


def _markdown(mode: str, payload: dict[str, Any]) -> str:
    overall = payload["overall"]
    rows = [
        [
            anomaly_type,
            str(stats["tp"]),
            str(stats["fp"]),
            str(stats["fn"]),
            f"{stats['precision']:.2%}",
            f"{stats['recall']:.2%}",
            f"{stats['f1']:.2%}",
        ]
        for anomaly_type, stats in payload["by_type"].items()
    ]
    return (
        f"# Discrepancy Detection Evaluation — mode: {mode}\n\n"
        f"Cases: {payload['cases_evaluated']} · Expected anomalies: "
        f"{payload['expected_anomalies']} · Precision: **{overall['precision']:.2%}** · "
        f"Recall: **{overall['recall']:.2%}** · F1: **{overall['f1']:.2%}**\n\n"
        + markdown_table(["Anomaly type", "TP", "FP", "FN", "Precision", "Recall", "F1"], rows)
    )


async def run_discrepancy_eval(
    mode: str = "rules",
    max_cases: int | None = None,
    benchmark_dir: Path | None = None,
    write: bool = True,
) -> dict[str, Any]:
    cases = load_benchmark_cases(benchmark_dir)
    if max_cases is not None:
        cases = cases[:max_cases]

    predictions: list[set[tuple[str, str | None]]] = []
    if mode == "rules":
        for case in cases:
            report = analyze_case(perfect_case_documents(case))
            predictions.append({(d.type.value, d.invoice_number) for d in report.discrepancies})
    elif mode == "end_to_end":
        service = ExtractionService(OllamaLLMProvider())
        for case in cases:
            documents = await extracted_case_documents(service, case, benchmark_dir)
            report = analyze_case(documents)
            predictions.append({(d.type.value, d.invoice_number) for d in report.discrepancies})
    else:
        raise ValueError(f"Unknown mode '{mode}' (expected 'rules' or 'end_to_end')")

    payload = {"mode": mode, **_score(cases, predictions)}
    if write:
        write_report(f"discrepancy_{mode}", payload, _markdown(mode, payload))
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the discrepancy detection evaluation.")
    parser.add_argument("--mode", choices=["rules", "end_to_end"], default="rules")
    parser.add_argument("--cases", type=int, default=None, help="limit number of cases")
    args = parser.parse_args(argv)
    try:
        payload = asyncio.run(run_discrepancy_eval(mode=args.mode, max_cases=args.cases))
    except OllamaUnavailableError as exc:
        print(f"SKIPPED: {exc}")
        return 1
    overall = payload["overall"]
    print(
        f"Discrepancy eval ({args.mode}): P={overall['precision']:.2%} "
        f"R={overall['recall']:.2%} F1={overall['f1']:.2%}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
