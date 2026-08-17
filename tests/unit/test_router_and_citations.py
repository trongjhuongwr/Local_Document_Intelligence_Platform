from uuid import uuid4

import pytest

from app.agents.router import QueryRoute, QueryRouter, RouteDecision, fallback_route
from app.citations.builder import build_citations, format_context
from app.citations.verifier import remove_unknown_citations, verify_citations
from app.core.exceptions import StructuredOutputValidationError
from app.llm.base import LLMTelemetry
from app.retrieval.base import RetrievalMode, RetrievedChunk
from app.retrieval.context import BuiltContext, ContextBudget, build_context


def _chunk(text: str = "Maximum aggregate fee: USD 75,000", **overrides: object) -> RetrievedChunk:
    values: dict = {
        "chunk_id": uuid4(),
        "document_id": uuid4(),
        "filename": "service_contract.pdf",
        "document_type": "contract",
        "page_number": 3,
        "section": "Fees",
        "text": text,
        "score": 0.9,
        "rank": 1,
        "mode": RetrievalMode.HYBRID,
    }
    values.update(overrides)
    return RetrievedChunk.model_validate(values)


# --- routing -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("Find any discrepancies between the invoice and contract", "discrepancy_analysis"),
        ("Compare the two invoices", "document_compare"),
        ("Summarize the payment policy", "summarization"),
        ("What is the total of invoice INV-2025-1?", "structured_lookup"),
        ("What does the contract say about confidentiality?", "factual_rag"),
    ],
)
def test_fallback_router(query: str, expected: str) -> None:
    assert fallback_route(query) == QueryRoute(expected)


async def test_router_uses_llm_when_available() -> None:
    class GoodProvider:
        async def generate(self, prompt, **kwargs):  # pragma: no cover
            raise NotImplementedError

        async def generate_structured(self, prompt, schema, **kwargs):
            telemetry = LLMTelemetry(model="fake", temperature=0.0, success=True)
            return RouteDecision(route=QueryRoute.SUMMARIZATION), telemetry

    result = await QueryRouter(GoodProvider()).route("Summarize the contract")
    assert result.route == QueryRoute.SUMMARIZATION
    assert result.method == "llm"


async def test_router_falls_back_on_invalid_output() -> None:
    class BrokenProvider:
        async def generate(self, prompt, **kwargs):  # pragma: no cover
            raise NotImplementedError

        async def generate_structured(self, prompt, schema, **kwargs):
            raise StructuredOutputValidationError("invalid output")

    result = await QueryRouter(BrokenProvider()).route("Compare these documents")
    assert result.route == QueryRoute.DOCUMENT_COMPARE
    assert result.method == "fallback"


# --- citations ---------------------------------------------------------------


def test_build_citations_assigns_sequential_ids() -> None:
    chunks = [_chunk(), _chunk(filename="invoice_001.pdf", page_number=1)]
    citations = build_citations(chunks)
    assert list(citations) == ["C1", "C2"]
    assert citations["C2"].filename == "invoice_001.pdf"
    assert "75,000" in citations["C1"].evidence


def test_format_context_includes_ids_and_pages() -> None:
    context = format_context([_chunk()])
    assert context.startswith("[C1] (service_contract.pdf, page 3")
    assert "Maximum aggregate fee" in context


def test_verify_citations_detects_invented_ids() -> None:
    citations = build_citations([_chunk()])
    result = verify_citations("The cap is $75,000 [C1][C9].", citations)
    assert result.valid is False
    assert result.unknown_citation_ids == ["C9"]
    assert result.used_citation_ids == ["C1", "C9"]


def test_verify_citations_ok() -> None:
    citations = build_citations([_chunk(), _chunk()])
    result = verify_citations("The cap is $75,000 [C1].", citations)
    assert result.valid is True
    assert result.unused_citation_ids == ["C2"]


def test_remove_unknown_citations() -> None:
    citations = build_citations([_chunk()])
    cleaned = remove_unknown_citations("Cap is $75,000 [C1][C9].", citations)
    assert "[C1]" in cleaned
    assert "[C9]" not in cleaned


# --- context budgeting -------------------------------------------------------


def test_context_deduplicates_and_caps() -> None:
    duplicate_id = uuid4()
    chunks = [
        _chunk(chunk_id=duplicate_id, text="alpha " * 50),
        _chunk(chunk_id=duplicate_id, text="alpha " * 50),  # same chunk id
        _chunk(text="alpha " * 50),  # same normalized text
        _chunk(text="beta " * 50),
        _chunk(text="gamma " * 50),
    ]
    result: BuiltContext = build_context(chunks, ContextBudget(max_chunks=2, max_chars=10_000))
    assert len(result.chunks) == 2
    assert result.dropped_duplicates == 2
    assert result.dropped_over_budget == 1


def test_context_respects_char_budget() -> None:
    chunks = [_chunk(text="x" * 900), _chunk(text="y" * 900)]
    result = build_context(chunks, ContextBudget(max_chunks=10, max_chars=1_000))
    assert len(result.chunks) == 1
    assert result.total_chars == 900
