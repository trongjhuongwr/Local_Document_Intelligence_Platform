"""Unit tests for the MCP tool functions with stubbed services (no DB, no Ollama)."""

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from app.core.exceptions import OllamaUnavailableError
from app.retrieval.base import RetrievalMode, RetrievedChunk
from mcp_server import server


class StubRetrieval:
    def __init__(self, chunks):
        self.chunks = chunks
        self.calls = []

    async def search(self, query, *, mode, top_k, filters):
        self.calls.append({"query": query, "mode": mode, "top_k": top_k, "filters": filters})
        return self.chunks


class StubReviews:
    def __init__(self, tasks):
        self.tasks = tasks
        self.calls = []

    async def list_tasks(self, *, status=None, case_id=None, limit=100):
        self.calls.append({"status": status, "case_id": case_id, "limit": limit})
        return self.tasks


def _install_services(monkeypatch, **attrs):
    services = SimpleNamespace(**attrs)
    monkeypatch.setattr(server, "_get_services", lambda: services)
    return services


def _forbid_services(monkeypatch):
    calls = []
    monkeypatch.setattr(server, "_get_services", lambda: calls.append("hit"))
    return calls


def _chunk(text: str, **overrides) -> RetrievedChunk:
    defaults = {
        "chunk_id": uuid.uuid4(),
        "document_id": uuid.uuid4(),
        "filename": "invoice_001.pdf",
        "document_type": "invoice",
        "page_number": 2,
        "section": "Totals",
        "text": text,
        "score": 1.25,
        "rank": 1,
        "mode": RetrievalMode.BM25,
    }
    defaults.update(overrides)
    return RetrievedChunk(**defaults)


async def test_search_documents_rejects_unknown_mode(monkeypatch):
    touched = _forbid_services(monkeypatch)
    result = await server.search_documents("total due", mode="fuzzy")
    assert "fuzzy" in result["error"]
    for valid in ("bm25", "dense", "hybrid"):
        assert valid in result["error"]
    assert touched == [], "validation must short-circuit before any backend access"


async def test_search_documents_rejects_bad_top_k(monkeypatch):
    touched = _forbid_services(monkeypatch)
    result = await server.search_documents("q", mode="bm25", top_k=0)
    assert "top_k" in result["error"]
    assert touched == []


async def test_search_documents_truncates_snippets(monkeypatch):
    long_chunk = _chunk("word " * 200)  # ~1000 characters once collapsed
    retrieval = StubRetrieval([long_chunk])
    _install_services(monkeypatch, retrieval=retrieval)

    result = await server.search_documents("word", mode="bm25", top_k=3)

    [row] = result["results"]
    assert len(row["snippet"]) <= 300
    assert row["snippet"].endswith("...")
    assert row["filename"] == "invoice_001.pdf"
    assert row["document_type"] == "invoice"
    assert row["page_number"] == 2
    assert row["section"] == "Totals"
    assert row["score"] == 1.25
    assert row["chunk_id"] == str(long_chunk.chunk_id)
    assert row["document_id"] == str(long_chunk.document_id)
    call = retrieval.calls[0]
    assert call["mode"] is RetrievalMode.BM25
    assert call["top_k"] == 3


async def test_search_documents_keeps_short_snippets_intact(monkeypatch):
    retrieval = StubRetrieval([_chunk("Total Due: USD 82,500.00")])
    _install_services(monkeypatch, retrieval=retrieval)
    result = await server.search_documents("total", mode="hybrid")
    [row] = result["results"]
    assert row["snippet"] == "Total Due: USD 82,500.00"


async def test_search_documents_passes_filters(monkeypatch):
    retrieval = StubRetrieval([])
    _install_services(monkeypatch, retrieval=retrieval)
    result = await server.search_documents(
        "q", mode="Dense", case_id="case_1", document_type="invoice"
    )
    assert result == {"results": []}
    call = retrieval.calls[0]
    assert call["mode"] is RetrievalMode.DENSE  # mode is normalised case-insensitively
    assert call["filters"].case_id == "case_1"
    assert call["filters"].document_type == "invoice"


async def test_search_documents_maps_backend_errors(monkeypatch):
    class FailingRetrieval:
        async def search(self, query, *, mode, top_k, filters):
            raise OllamaUnavailableError("Ollama server unreachable at http://localhost:11434")

    _install_services(monkeypatch, retrieval=FailingRetrieval())
    result = await server.search_documents("q", mode="dense")
    assert result == {"error": "Ollama server unreachable at http://localhost:11434"}


async def test_get_document_rejects_bad_uuid(monkeypatch):
    touched = _forbid_services(monkeypatch)
    result = await server.get_document("not-a-uuid")
    assert result["error"] == "invalid document id 'not-a-uuid': not a UUID"
    assert touched == []


async def test_get_document_fields_rejects_bad_uuid(monkeypatch):
    touched = _forbid_services(monkeypatch)
    result = await server.get_document_fields("123")
    assert result["error"] == "invalid document id '123': not a UUID"
    assert touched == []


async def test_get_review_findings_serialization(monkeypatch):
    decided = SimpleNamespace(
        id=uuid.uuid4(),
        case_id="case_7",
        severity="high",
        status="APPROVED",
        discrepancy={"type": "amount_exceeds_contract", "description": "over cap"},
        reviewer="alice",
        decided_at=datetime(2026, 8, 1, 12, 0, tzinfo=UTC),
        created_at=datetime(2026, 7, 31, 9, 30, tzinfo=UTC),
    )
    open_task = SimpleNamespace(
        id=uuid.uuid4(),
        case_id="case_7",
        severity="medium",
        status="OPEN",
        discrepancy={"type": "po_mismatch"},
        reviewer=None,
        decided_at=None,
        created_at=datetime(2026, 7, 30, 8, 0, tzinfo=UTC),
    )
    reviews = StubReviews([decided, open_task])
    _install_services(monkeypatch, reviews=reviews)

    result = await server.get_review_findings(status="approved", case_id="case_7", limit=10)

    assert reviews.calls[0] == {"status": "APPROVED", "case_id": "case_7", "limit": 10}
    assert result["reviews"][0] == {
        "review_id": str(decided.id),
        "case_id": "case_7",
        "severity": "high",
        "status": "APPROVED",
        "discrepancy": {"type": "amount_exceeds_contract", "description": "over cap"},
        "reviewer": "alice",
        "decided_at": "2026-08-01T12:00:00+00:00",
        "created_at": "2026-07-31T09:30:00+00:00",
    }
    assert result["reviews"][1]["decided_at"] is None
    assert result["reviews"][1]["reviewer"] is None


async def test_get_review_findings_rejects_bad_limit(monkeypatch):
    touched = _forbid_services(monkeypatch)
    result = await server.get_review_findings(limit=0)
    assert "limit" in result["error"]
    assert touched == []


async def test_all_five_tools_are_registered():
    tools = await server.mcp.list_tools()
    assert {tool.name for tool in tools} == {
        "search_documents",
        "get_document",
        "get_document_fields",
        "compare_documents",
        "get_review_findings",
    }
    assert all(tool.annotations and tool.annotations.read_only_hint for tool in tools)
