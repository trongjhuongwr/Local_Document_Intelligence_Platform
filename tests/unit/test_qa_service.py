from uuid import uuid4

from app.agents.router import QueryRoute, RouteDecision
from app.llm.base import LLMResult, LLMTelemetry
from app.retrieval.base import RetrievalMode, RetrievedChunk
from app.services.qa import NO_EVIDENCE_ANSWER, QAService


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

    async def search(self, query, *, top_k=10, filters=None):
        self.calls.append({"query": query, "top_k": top_k, "filters": filters})
        return self._chunks


async def test_answer_with_valid_citations() -> None:
    provider = FakeProvider("The contract cap is USD 75,000 [C1].")
    retriever = FakeRetriever([_chunk("Maximum aggregate fees: USD 75,000.00")])
    service = QAService(provider, retriever)

    result = await service.answer("What is the maximum contract amount?")

    assert "[C1]" in result.answer
    assert result.verification is not None and result.verification.valid is True
    assert result.citations["C1"].filename == "service_contract.pdf"
    assert result.route == QueryRoute.FACTUAL_RAG
    assert result.retrieved_count == 1
    assert "Maximum aggregate fees" in provider.generate_calls[0]["prompt"]
    assert provider.generate_calls[0]["temperature"] == 0.0


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
