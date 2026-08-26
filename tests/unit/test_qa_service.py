from uuid import uuid4

from app.agents.router import QueryRoute, RouteDecision
from app.llm.base import LLMResult, LLMTelemetry
from app.retrieval.base import RetrievalMode, RetrievedChunk, SearchFilters
from app.services.qa import NO_EVIDENCE_ANSWER, QAService, detect_ambiguous_scope


def _chunk(text: str, filename: str = "service_contract.pdf") -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=uuid4(),
        document_id=uuid4(),
        filename=filename,
        document_type="contract",
        page_number=3,
        section="Fees",
        text=text,
        score=0.9,
        rank=1,
        mode=RetrievalMode.HYBRID,
    )


class FakeProvider:
    def __init__(self, answer_text: str, route: QueryRoute = QueryRoute.FACTUAL_RAG) -> None:
        self._answer = answer_text
        self._route = route
        self.generate_calls: list[dict] = []

    async def generate(self, prompt, **kwargs):
        self.generate_calls.append({"prompt": prompt, **kwargs})
        return LLMResult(
            text=self._answer,
            telemetry=LLMTelemetry(model="fake", temperature=0.0, success=True),
        )

    async def generate_structured(self, prompt, schema, **kwargs):
        telemetry = LLMTelemetry(model="fake", temperature=0.0, success=True)
        return RouteDecision(route=self._route), telemetry


class FakeRetriever:
    def __init__(self, chunks: list[RetrievedChunk]) -> None:
        self._chunks = chunks
        self.calls: list[dict] = []

    async def search(self, query, *, mode, top_k=10, filters=None):
        self.calls.append({"query": query, "mode": mode, "top_k": top_k, "filters": filters})
        return self._chunks


async def test_answer_with_valid_citations() -> None:
    provider = FakeProvider("The contract cap is USD 75,000 [C1].")
    retriever = FakeRetriever([_chunk("Maximum aggregate fees: USD 75,000.00")])
    service = QAService(provider, retriever)

    result = await service.answer("What is the maximum contract amount?")

    assert "[C1]" in result.answer
    assert result.verification is not None and result.verification.valid is True
    assert result.citations["C1"].filename == "service_contract.pdf"
    assert result.route == QueryRoute.STRUCTURED_LOOKUP  # keyword rule: "what is the"
    assert result.retrieved_count == 1
    assert retriever.calls[0]["mode"] == RetrievalMode.BM25
    assert "Maximum aggregate fees" in provider.generate_calls[0]["prompt"]
    assert provider.generate_calls[0]["temperature"] == 0.0
    assert provider.generate_calls[0]["max_tokens"] == 256


async def test_invented_citations_are_stripped() -> None:
    provider = FakeProvider("The cap is USD 75,000 [C1][C7].")
    retriever = FakeRetriever([_chunk("Maximum aggregate fees: USD 75,000.00")])
    service = QAService(provider, retriever)

    result = await service.answer("What is the cap?")

    assert result.verification is not None and result.verification.valid is False
    assert "[C7]" not in result.answer
    assert "[C1]" in result.answer


async def test_no_evidence_short_circuits_llm() -> None:
    provider = FakeProvider("should never be used")
    retriever = FakeRetriever([])
    service = QAService(provider, retriever)

    result = await service.answer("What is the cap?")

    assert result.answer == NO_EVIDENCE_ANSWER
    assert provider.generate_calls == []
    assert result.citations == {}


async def test_discrepancy_route_suggests_compare_workflow() -> None:
    provider = FakeProvider("See the compare workflow [C1].", route=QueryRoute.DISCREPANCY_ANALYSIS)
    retriever = FakeRetriever([_chunk("Total Due: USD 82,500.00", "invoice_001.pdf")])
    service = QAService(provider, retriever)

    result = await service.answer("Find inconsistencies between these documents")

    assert result.route == QueryRoute.DISCREPANCY_ANALYSIS
    assert result.suggested_action == "run_compare_workflow"


async def test_requested_retrieval_mode_is_forwarded() -> None:
    provider = FakeProvider("The contract cap is USD 75,000 [C1].")
    retriever = FakeRetriever([_chunk("Maximum aggregate fees: USD 75,000.00")])
    service = QAService(provider, retriever)

    result = await service.answer(
        "What is the maximum contract amount?",
        mode=RetrievalMode.DENSE,
    )

    assert retriever.calls[0]["mode"] == RetrievalMode.DENSE
    assert result.retrieval_mode == RetrievalMode.DENSE


# --- ambiguous-scope guardrail -------------------------------------------------


def _chunk_from(document_id, filename: str = "service_contract.pdf") -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=uuid4(),
        document_id=document_id,
        filename=filename,
        document_type="contract",
        page_number=1,
        section="Fees",
        text="Maximum aggregate fees: USD 66,000.00",
        score=0.9,
        rank=1,
        mode=RetrievalMode.BM25,
    )


def test_lookup_across_several_packs_is_flagged() -> None:
    chunks = [_chunk_from(uuid4()), _chunk_from(uuid4()), _chunk_from(uuid4())]

    warning = detect_ambiguous_scope(chunks, QueryRoute.STRUCTURED_LOOKUP, None)

    assert warning is not None
    assert "3 different documents" in warning
    assert "service_contract.pdf" in warning


def test_lookup_within_one_pack_is_not_flagged() -> None:
    document_id = uuid4()
    chunks = [_chunk_from(document_id), _chunk_from(document_id)]

    assert detect_ambiguous_scope(chunks, QueryRoute.STRUCTURED_LOOKUP, None) is None


def test_case_filter_removes_the_ambiguity() -> None:
    chunks = [_chunk_from(uuid4()), _chunk_from(uuid4())]

    warning = detect_ambiguous_scope(
        chunks, QueryRoute.STRUCTURED_LOOKUP, SearchFilters(case_id="case_015")
    )

    assert warning is None


def test_other_routes_are_not_flagged() -> None:
    """Comparison and summarisation legitimately span packs."""
    chunks = [_chunk_from(uuid4()), _chunk_from(uuid4())]

    assert detect_ambiguous_scope(chunks, QueryRoute.DOCUMENT_COMPARE, None) is None
    assert detect_ambiguous_scope(chunks, QueryRoute.FACTUAL_RAG, None) is None
