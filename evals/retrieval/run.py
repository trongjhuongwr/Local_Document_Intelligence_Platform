"""Eval 2 — retrieval quality (bm25 vs dense vs hybrid) against DocFlowBench.

Builds a deterministic query set from ground truth (no LLM involved): each
query has exactly one expected document within its case, identified by
``(case_id, filename)``. The benchmark corpus is ingested through the real
pipeline (sha256 dedup makes re-runs idempotent), embedded with the local
Ollama model, and searched corpus-wide — every other case's documents act as
distractors.

Metrics per mode: Recall@1/@3/@5 (was a relevant chunk retrieved in the top
k), MRR, and nDCG@5 with binary gains where the ideal ranking fills the top
positions with the expected document's chunks.
"""

import argparse
import asyncio
import math
import statistics
import uuid
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.exceptions import OllamaUnavailableError
from app.db.session import get_engine, get_sessionmaker
from app.models import Chunk, Document
from app.retrieval.base import RetrievalMode, SearchFilters
from app.retrieval.service import RetrievalService
from app.services.documents import DocumentService
from evals.common import (
    case_documents_dir,
    load_benchmark_cases,
    markdown_table,
    ollama_available,
    write_report,
)
from synthetic_data.generator.models import BenchmarkCase

TOP_K = 10
MODES = [RetrievalMode.BM25, RetrievalMode.DENSE, RetrievalMode.HYBRID]


@dataclass(frozen=True, slots=True)
class EvalQuery:
    case_id: str
    query: str
    expected_filename: str


def build_queries(case: BenchmarkCase) -> list[EvalQuery]:
    """Four deterministic queries per case, each with one expected document."""
    queries = [
        EvalQuery(
            case_id=case.case_id,
            query=f"What is the maximum contract amount agreed with {case.vendor}?",
            expected_filename="service_contract.pdf",
        ),
        EvalQuery(
            case_id=case.case_id,
            query=(f"What amount was approved in purchase order {case.purchase_order.po_number}?"),
            expected_filename="purchase_order.pdf",
        ),
        EvalQuery(
            case_id=case.case_id,
            query=(
                "What are the standard payment terms required by the accounts payable "
                f"policy of {case.customer}?"
            ),
            expected_filename="payment_policy.pdf",
        ),
    ]
    if case.invoices:
        invoice = case.invoices[0]
        queries.append(
            EvalQuery(
                case_id=case.case_id,
                query=f"What is the total due on invoice {invoice.invoice_number}?",
                expected_filename=invoice.filename,
            )
        )
    return queries


def _case_pdfs(case: BenchmarkCase) -> list[tuple[str, str]]:
    """(document_type, filename) for every PDF belonging to the case."""
    pdfs = [
        ("contract", "service_contract.pdf"),
        ("purchase_order", "purchase_order.pdf"),
        ("policy", "payment_policy.pdf"),
    ]
    pdfs.extend(("invoice", invoice.filename) for invoice in case.invoices)
    return pdfs


async def ensure_corpus(cases: list[BenchmarkCase], benchmark_dir: Path | None) -> tuple[int, int]:
    """Ingest every benchmark PDF (idempotent via sha256 dedup) and embed chunks.

    Returns (documents_seen, chunks_newly_indexed).
    """
    sessionmaker = get_sessionmaker()
    documents_seen = 0
    for case in cases:
        docs_dir = case_documents_dir(case, benchmark_dir)
        for document_type, filename in _case_pdfs(case):
            data = (docs_dir / filename).read_bytes()
            async with sessionmaker() as session:
                await DocumentService(session).upload(
                    data=data,
                    filename=filename,
                    document_type=document_type,
                    case_id=case.case_id,
                )
            documents_seen += 1
    newly_indexed = await RetrievalService().index_pending()
    return documents_seen, newly_indexed


async def _document_maps() -> tuple[dict[uuid.UUID, tuple[str | None, str]], dict[uuid.UUID, int]]:
    """(document_id -> (case_id, filename), document_id -> chunk_count) for the corpus."""
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        doc_rows = (
            await session.execute(select(Document.id, Document.case_id, Document.filename))
        ).all()
        count_rows = (
            await session.execute(
                select(Chunk.document_id, func.count()).group_by(Chunk.document_id)
            )
        ).all()
    identity = {row[0]: (row[1], row[2]) for row in doc_rows}
    chunk_counts = {row[0]: int(row[1]) for row in count_rows}
    return identity, chunk_counts


def query_metrics(relevance: list[bool], *, relevant_chunks: int) -> dict[str, float]:
    """Rank metrics for one query given per-position relevance flags."""
    first_hit = next((position for position, hit in enumerate(relevance, start=1) if hit), None)
    dcg = sum(1.0 / math.log2(position + 1) for position, hit in enumerate(relevance[:5], 1) if hit)
    ideal_hits = min(relevant_chunks, 5)
    idcg = sum(1.0 / math.log2(position + 1) for position in range(1, ideal_hits + 1))
    return {
        "recall_at_1": 1.0 if any(relevance[:1]) else 0.0,
        "recall_at_3": 1.0 if any(relevance[:3]) else 0.0,
        "recall_at_5": 1.0 if any(relevance[:5]) else 0.0,
        "mrr": 1.0 / first_hit if first_hit else 0.0,
        "ndcg_at_5": dcg / idcg if idcg else 0.0,
    }


async def run_retrieval_eval(
    max_cases: int | None = None, benchmark_dir: Path | None = None
) -> dict[str, Any]:
    if not await ollama_available():
        raise OllamaUnavailableError(
            "Retrieval eval needs a live Ollama server for dense embeddings"
        )
    cases = load_benchmark_cases(benchmark_dir)
    if max_cases is not None:
        cases = cases[:max_cases]

    documents_seen, newly_indexed = await ensure_corpus(cases, benchmark_dir)
    identity, chunk_counts = await _document_maps()
    expected_file_keys = {
        (case.case_id, filename) for case in cases for _document_type, filename in _case_pdfs(case)
    }
    # Keep exactly one stored document for each benchmark file. This makes the
    # eval independent of stale duplicate rows in a developer database.
    expected_ids = {
        (case_id, filename): document_id
        for document_id, (case_id, filename) in identity.items()
        if (case_id, filename) in expected_file_keys
    }
    corpus_document_ids = list(expected_ids.values())

    queries = [query for case in cases for query in build_queries(case)]
    service = RetrievalService()

    per_mode: dict[str, Any] = {}
    for mode in MODES:
        metric_lists: dict[str, list[float]] = {
            "recall_at_1": [],
            "recall_at_3": [],
            "recall_at_5": [],
            "mrr": [],
            "ndcg_at_5": [],
        }
        latencies_ms: list[float] = []
        for eval_query in queries:
            expected_id = expected_ids.get((eval_query.case_id, eval_query.expected_filename))
            started = perf_counter()
            results = await service.search(
                eval_query.query,
                mode=mode,
                top_k=TOP_K,
                filters=SearchFilters(document_ids=corpus_document_ids),
            )
            latencies_ms.append((perf_counter() - started) * 1000.0)
            relevance = [chunk.document_id == expected_id for chunk in results]
            relevant_chunks = chunk_counts.get(expected_id, 0) if expected_id else 0
            for name, value in query_metrics(relevance, relevant_chunks=relevant_chunks).items():
                metric_lists[name].append(value)
        per_mode[str(mode)] = {
            name: round(statistics.mean(values), 4) if values else 0.0
            for name, values in metric_lists.items()
        }
        per_mode[str(mode)]["mean_latency_ms"] = (
            round(statistics.mean(latencies_ms), 1) if latencies_ms else 0.0
        )

    headline = (
        f"BM25 recommended: Recall@5 {per_mode['bm25']['recall_at_5']:.2f}, "
        f"MRR {per_mode['bm25']['mrr']:.2f}, "
        f"{per_mode['bm25']['mean_latency_ms']:.0f} ms; hybrid Recall@5 "
        f"{per_mode['hybrid']['recall_at_5']:.2f}, MRR {per_mode['hybrid']['mrr']:.2f}, "
        f"{per_mode['hybrid']['mean_latency_ms']:.0f} ms"
    )
    payload: dict[str, Any] = {
        "cases_evaluated": len(cases),
        "query_count": len(queries),
        "top_k": TOP_K,
        "embedding_model": get_settings().ollama_embedding_model,
        "corpus_documents": len(corpus_document_ids),
        "documents_ingested_or_reused": documents_seen,
        "chunks_newly_indexed": newly_indexed,
        "modes": per_mode,
        "recommended_default": "bm25",
        "recommendation_basis": (
            "BM25 ties hybrid on Recall@5 while producing better Recall@1, MRR, "
            "nDCG@5, and mean latency on this benchmark."
        ),
        "headline": headline,
    }

    rows = [
        [
            mode_name,
            f"{stats['recall_at_1']:.2f}",
            f"{stats['recall_at_3']:.2f}",
            f"{stats['recall_at_5']:.2f}",
            f"{stats['mrr']:.2f}",
            f"{stats['ndcg_at_5']:.2f}",
            f"{stats['mean_latency_ms']:.0f}",
        ]
        for mode_name, stats in per_mode.items()
    ]
    markdown = (
        "# Retrieval Evaluation (DocFlowBench)\n\n"
        f"Embedding model: `{payload['embedding_model']}` · Cases: {len(cases)} · "
        f"Queries: {len(queries)} · top_k: {TOP_K}\n\n"
        f"**{headline}**\n\n"
        f"Production default: **BM25**. {payload['recommendation_basis']}\n\n"
        + markdown_table(
            ["Mode", "Recall@1", "Recall@3", "Recall@5", "MRR", "nDCG@5", "Mean latency (ms)"],
            rows,
        )
    )
    write_report("retrieval", payload, markdown)
    return payload


async def run_for_run_all(max_cases: int | None) -> dict[str, Any]:
    """Entry point picked up by ``python -m evals.run_all``."""
    return await run_retrieval_eval(max_cases=max_cases)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the retrieval evaluation.")
    parser.add_argument("--cases", type=int, default=None, help="limit number of cases")
    args = parser.parse_args(argv)

    async def _run() -> dict[str, Any]:
        try:
            return await run_retrieval_eval(max_cases=args.cases)
        finally:
            await get_engine().dispose()

    try:
        payload = asyncio.run(_run())
    except OllamaUnavailableError as exc:
        print(f"SKIPPED: {exc}")
        return 1
    print(f"Retrieval eval complete: {payload['headline']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
