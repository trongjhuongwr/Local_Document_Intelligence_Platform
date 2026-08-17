"""Eval 3 — query routing accuracy, macro F1, and confusion matrix.

Scores both the LLM router (llama3.2:1b constrained classification) and the
deterministic keyword fallback on the same labeled query set.
"""

import argparse
import asyncio
from collections import defaultdict
from typing import Any

from app.agents.router import QueryRoute, QueryRouter, fallback_route
from app.core.exceptions import OllamaUnavailableError
from app.llm.ollama import OllamaLLMProvider
from evals.common import markdown_table, precision_recall_f1, write_report

LABELED_QUERIES: list[tuple[str, QueryRoute]] = [
    # factual_rag
    ("What does the contract say about confidentiality?", QueryRoute.FACTUAL_RAG),
    ("What obligations does the provider have under the agreement?", QueryRoute.FACTUAL_RAG),
    ("Under what conditions can the agreement be terminated?", QueryRoute.FACTUAL_RAG),
    ("What does the payment policy say about approving large invoices?", QueryRoute.FACTUAL_RAG),
    ("Which currency does the policy require invoices to be issued in?", QueryRoute.FACTUAL_RAG),
    ("Does the contract allow subcontracting of deliverables?", QueryRoute.FACTUAL_RAG),
    ("What does the policy say about invoices without a purchase order?", QueryRoute.FACTUAL_RAG),
    ("Where does the contract define the maximum aggregate fees?", QueryRoute.FACTUAL_RAG),
    # structured_lookup
    ("What is the total due on invoice INV-2025-83614?", QueryRoute.STRUCTURED_LOOKUP),
    ("What is the issue date of purchase order PO-2025-4821?", QueryRoute.STRUCTURED_LOOKUP),
    ("How much is the subtotal on invoice INV-2025-90112?", QueryRoute.STRUCTURED_LOOKUP),
    ("What is the due date of invoice INV-2025-55510?", QueryRoute.STRUCTURED_LOOKUP),
    ("What payment terms are stated on invoice INV-2025-70431?", QueryRoute.STRUCTURED_LOOKUP),
    ("What is the approved amount of PO-2025-1177?", QueryRoute.STRUCTURED_LOOKUP),
    (
        "What is the invoice number of the latest invoice from Acme Analytics?",
        QueryRoute.STRUCTURED_LOOKUP,
    ),
    ("What currency is invoice INV-2025-64203 issued in?", QueryRoute.STRUCTURED_LOOKUP),
    # document_compare
    ("Compare the service contract with the purchase order.", QueryRoute.DOCUMENT_COMPARE),
    (
        "What are the differences between invoice_001 and invoice_002?",
        QueryRoute.DOCUMENT_COMPARE,
    ),
    (
        "Compare the payment terms in the contract versus the invoice.",
        QueryRoute.DOCUMENT_COMPARE,
    ),
    (
        "Compare the vendor details on the contract and the purchase order.",
        QueryRoute.DOCUMENT_COMPARE,
    ),
    ("Contract vs invoice: which one states the higher amount?", QueryRoute.DOCUMENT_COMPARE),
    ("Compare the dates on the purchase order and the invoice.", QueryRoute.DOCUMENT_COMPARE),
    (
        "What differs between the two invoices from Falcon Industrial Supply?",
        QueryRoute.DOCUMENT_COMPARE,
    ),
    ("Compare these documents side by side.", QueryRoute.DOCUMENT_COMPARE),
    # discrepancy_analysis
    ("Are there any inconsistencies between these documents?", QueryRoute.DISCREPANCY_ANALYSIS),
    (
        "Find discrepancies involving amounts, dates, or payment terms.",
        QueryRoute.DISCREPANCY_ANALYSIS,
    ),
    ("Does any invoice exceed the contract limit?", QueryRoute.DISCREPANCY_ANALYSIS),
    ("Check this case for duplicate invoices.", QueryRoute.DISCREPANCY_ANALYSIS),
    (
        "Identify any policy violations in the uploaded invoices.",
        QueryRoute.DISCREPANCY_ANALYSIS,
    ),
    (
        "Is the vendor overbilling us relative to the agreed cap?",
        QueryRoute.DISCREPANCY_ANALYSIS,
    ),
    (
        "Flag any anomalies across the contract, PO, and invoices.",
        QueryRoute.DISCREPANCY_ANALYSIS,
    ),
    ("Which invoices conflict with the purchase order?", QueryRoute.DISCREPANCY_ANALYSIS),
    # summarization
    ("Summarize the payment policy.", QueryRoute.SUMMARIZATION),
    ("Give me a brief overview of the service agreement.", QueryRoute.SUMMARIZATION),
    ("TL;DR of invoice_001 please.", QueryRoute.SUMMARIZATION),
    ("Summarize the key terms of the contract.", QueryRoute.SUMMARIZATION),
    ("Provide an executive summary of this document pack.", QueryRoute.SUMMARIZATION),
    ("What are the main points of the purchase order?", QueryRoute.SUMMARIZATION),
    ("Give a short overview of the vendor's obligations.", QueryRoute.SUMMARIZATION),
    ("Summarize what these documents are about.", QueryRoute.SUMMARIZATION),
]


def _score(pairs: list[tuple[QueryRoute, QueryRoute]]) -> dict[str, Any]:
    correct = sum(1 for expected, predicted in pairs if expected == predicted)
    confusion: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for expected, predicted in pairs:
        confusion[expected.value][predicted.value] += 1

    per_route = {}
    f1_values = []
    for route in QueryRoute:
        tp = sum(1 for e, p in pairs if e == route and p == route)
        fp = sum(1 for e, p in pairs if e != route and p == route)
        fn = sum(1 for e, p in pairs if e == route and p != route)
        scores = precision_recall_f1(tp, fp, fn)
        per_route[route.value] = scores
        f1_values.append(scores["f1"])

    return {
        "total": len(pairs),
        "accuracy": round(correct / len(pairs), 4) if pairs else 0.0,
        "macro_f1": round(sum(f1_values) / len(f1_values), 4) if f1_values else 0.0,
        "per_route": per_route,
        "confusion_matrix": {k: dict(v) for k, v in confusion.items()},
    }


async def run_routing_eval(max_cases: int | None = None, write: bool = True) -> dict[str, Any]:
    queries = LABELED_QUERIES if max_cases is None else LABELED_QUERIES[: max_cases * 5]
    router = QueryRouter(OllamaLLMProvider())

    llm_pairs: list[tuple[QueryRoute, QueryRoute]] = []
    fallback_uses = 0
    for query, expected in queries:
        result = await router.route(query)
        if result.method == "fallback":
            fallback_uses += 1
        llm_pairs.append((expected, result.route))

    fallback_pairs = [(expected, fallback_route(query)) for query, expected in queries]

    llm_scores = _score(llm_pairs)
    fallback_scores = _score(fallback_pairs)
    payload: dict[str, Any] = {
        "model": "llama3.2:1b",
        "llm_router": llm_scores,
        "llm_router_fallback_invocations": fallback_uses,
        "keyword_fallback": fallback_scores,
        "headline": (
            f"LLM routing accuracy {llm_scores['accuracy']:.2%} "
            f"(macro F1 {llm_scores['macro_f1']:.2%}); keyword fallback "
            f"{fallback_scores['accuracy']:.2%}"
        ),
    }

    rows = [
        [
            route,
            f"{llm_scores['per_route'][route]['precision']:.2%}",
            f"{llm_scores['per_route'][route]['recall']:.2%}",
            f"{llm_scores['per_route'][route]['f1']:.2%}",
            f"{fallback_scores['per_route'][route]['f1']:.2%}",
        ]
        for route in llm_scores["per_route"]
    ]
    markdown = (
        "# Query Routing Evaluation\n\n"
        f"Queries: {llm_scores['total']} · LLM accuracy: **{llm_scores['accuracy']:.2%}** · "
        f"LLM macro F1: **{llm_scores['macro_f1']:.2%}** · Keyword fallback accuracy: "
        f"**{fallback_scores['accuracy']:.2%}**\n\n"
        + markdown_table(["Route", "LLM precision", "LLM recall", "LLM F1", "Fallback F1"], rows)
        + "\n\nConfusion matrix (LLM): rows = expected, columns = predicted\n\n"
        + str(llm_scores["confusion_matrix"])
    )
    if write:
        write_report("routing", payload, markdown)
    return payload


async def run_for_run_all(max_cases: int | None) -> dict[str, Any]:
    return await run_routing_eval(max_cases=max_cases)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the query-routing evaluation.")
    parser.add_argument("--cases", type=int, default=None)
    args = parser.parse_args(argv)
    try:
        payload = asyncio.run(run_routing_eval(max_cases=args.cases))
    except OllamaUnavailableError as exc:
        print(f"SKIPPED: {exc}")
        return 1
    print(payload["headline"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
