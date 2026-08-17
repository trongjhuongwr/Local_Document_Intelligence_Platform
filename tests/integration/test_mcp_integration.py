"""Integration tests for the read-only MCP tools against live Postgres.

Each test seeds its own case (unique case_id) via the ORM: parsed documents
with chunks, schema-valid extraction runs, and a review task. No Ollama is
required — search runs in bm25 mode and compare_documents only reads stored
extractions.
"""

import uuid
from typing import Any

import pytest
from sqlalchemy import func, select

from app.db.session import get_sessionmaker
from app.ingestion.types import ChunkDraft
from app.models import ExtractionRun, ReviewTask, WorkflowRun
from app.repositories.documents import DocumentRepository
from mcp_server import server

pytestmark = pytest.mark.integration

_CONTRACT_DATA = {
    "vendor_name": "Acme Analytics Ltd",
    "currency": "USD",
    "maximum_amount": 75000.0,
    "payment_terms": "Net 30",
    "effective_date": "2025-01-01",
    "expiration_date": "2026-01-01",
}
_INVOICE_DATA = {
    "invoice_number": "INV-MCP-1",
    "vendor_name": "Acme Analytics Ltd",
    "currency": "USD",
    "subtotal": 80000.0,
    "tax_rate_percent": 3.125,
    "tax": 2500.0,
    "total": 82500.0,
    "issue_date": "2025-06-01",
    "due_date": "2025-07-01",
    "payment_terms": "Net 30",
    "po_reference": "PO-MCP-1",
}


async def _seed_case() -> dict[str, Any]:
    """Seed one case: contract + invoice (with valid extractions), policy (without)."""
    case_id = f"mcp_case_{uuid.uuid4().hex[:10]}"
    sessionmaker = get_sessionmaker()
    documents: dict[str, Any] = {}
    async with sessionmaker() as session:
        repository = DocumentRepository(session)
        for document_type, filename, text in [
            ("contract", "service_contract.pdf", "Maximum aggregate fees: USD 75,000.00"),
            ("invoice", "invoice_9001.pdf", "Total Due: USD 82,500.00 payable Net 30"),
            ("policy", "payment_policy.pdf", "All invoices must reference a purchase order."),
        ]:
            documents[document_type] = await repository.create(
                filename=filename,
                content_sha256=uuid.uuid4().hex + uuid.uuid4().hex,
                mime_type="application/pdf",
                size_bytes=1234,
                page_count=1,
                document_type=document_type,
                case_id=case_id,
                status="parsed",
                parser_version="test",
                chunks=[
                    ChunkDraft(
                        text=text,
                        page_number=1,
                        section=None,
                        element_type="paragraph",
                        order_index=0,
                        token_estimate=12,
                        metadata={},
                    )
                ],
            )
        session.add_all(
            [
                ExtractionRun(
                    document_id=documents["contract"].id,
                    document_type="contract",
                    data=_CONTRACT_DATA,
                    method="seed",
                    prompt_name="extraction_contract",
                    prompt_version="1",
                    schema_valid=True,
                    telemetry={},
                ),
                # An older invalid run for the invoice: must never be surfaced.
                ExtractionRun(
                    document_id=documents["invoice"].id,
                    document_type="invoice",
                    data={},
                    method="seed",
                    prompt_name="extraction_invoice",
                    prompt_version="0",
                    schema_valid=False,
                    telemetry={},
                ),
                ExtractionRun(
                    document_id=documents["invoice"].id,
                    document_type="invoice",
                    data=_INVOICE_DATA,
                    method="seed",
                    prompt_name="extraction_invoice",
                    prompt_version="1",
                    schema_valid=True,
                    telemetry={},
                ),
            ]
        )
        review = ReviewTask(
            case_id=case_id,
            severity="high",
            discrepancy={"type": "amount_exceeds_contract", "description": "seeded finding"},
        )
        session.add(review)
        await session.commit()
        await session.refresh(review)
    return {"case_id": case_id, "documents": documents, "review_id": str(review.id)}


async def _count_rows(model: type) -> int:
    async with get_sessionmaker()() as session:
        result = await session.execute(select(func.count()).select_from(model))
        return int(result.scalar_one())


async def test_get_document_returns_metadata():
    seeded = await _seed_case()
    invoice = seeded["documents"]["invoice"]

    result = await server.get_document(str(invoice.id))

    assert result == {
        "id": str(invoice.id),
        "filename": "invoice_9001.pdf",
        "document_type": "invoice",
        "case_id": seeded["case_id"],
        "status": "parsed",
        "page_count": 1,
        "size_bytes": 1234,
        "sha256": invoice.content_sha256,
        "created_at": invoice.created_at.isoformat(),
    }

    missing = await server.get_document(str(uuid.uuid4()))
    assert "not found" in missing["error"]


async def test_get_document_fields_returns_latest_valid_extraction():
    seeded = await _seed_case()
    invoice = seeded["documents"]["invoice"]

    result = await server.get_document_fields(str(invoice.id))

    assert result["data"] == _INVOICE_DATA
    assert result["document_type"] == "invoice"
    assert result["prompt_version"] == "1"
    assert isinstance(result["extracted_at"], str)

    no_extraction = await server.get_document_fields(str(seeded["documents"]["policy"].id))
    assert no_extraction["error"] == "no extraction available"


async def test_get_review_findings_filters_by_case():
    seeded = await _seed_case()

    result = await server.get_review_findings(case_id=seeded["case_id"])

    assert [row["review_id"] for row in result["reviews"]] == [seeded["review_id"]]
    row = result["reviews"][0]
    assert row["case_id"] == seeded["case_id"]
    assert row["severity"] == "high"
    assert row["status"] == "OPEN"
    assert row["discrepancy"]["type"] == "amount_exceeds_contract"
    assert row["reviewer"] is None
    assert row["decided_at"] is None
    assert isinstance(row["created_at"], str)

    other_case = await server.get_review_findings(case_id=f"absent_{uuid.uuid4().hex[:8]}")
    assert other_case == {"reviews": []}


async def test_compare_documents_returns_report_and_writes_nothing():
    seeded = await _seed_case()
    workflow_runs_before = await _count_rows(WorkflowRun)
    review_tasks_before = await _count_rows(ReviewTask)
    extraction_runs_before = await _count_rows(ExtractionRun)

    result = await server.compare_documents(seeded["case_id"])

    assert "error" not in result
    assert result["case_id"] == seeded["case_id"]
    report = result["report"]
    assert {d["type"] for d in report["discrepancies"]} >= {"amount_exceeds_contract"}
    assert report["requires_human_review"] is True
    assert report["documents_analyzed"] == 2  # contract + invoice; policy has no extraction
    missing = result["missing_extractions"]
    assert [m["document_id"] for m in missing] == [str(seeded["documents"]["policy"].id)]
    assert missing[0]["document_type"] == "policy"
    assert "read-only" in result["note"]

    # Strictly read-only: the analysis must not have persisted anything.
    assert await _count_rows(WorkflowRun) == workflow_runs_before
    assert await _count_rows(ReviewTask) == review_tasks_before
    assert await _count_rows(ExtractionRun) == extraction_runs_before


async def test_search_documents_bm25_without_ollama():
    seeded = await _seed_case()

    result = await server.search_documents(
        "Total Due", mode="bm25", top_k=5, case_id=seeded["case_id"]
    )

    assert result["results"], "expected at least one BM25 hit"
    top = result["results"][0]
    assert top["document_id"] == str(seeded["documents"]["invoice"].id)
    assert top["filename"] == "invoice_9001.pdf"
    assert "Total Due" in top["snippet"]
    assert len(top["snippet"]) <= 300
    assert top["score"] > 0
    # The case filter keeps other seeded cases out of the corpus.
    returned_documents = {row["document_id"] for row in result["results"]}
    seeded_ids = {str(document.id) for document in seeded["documents"].values()}
    assert returned_documents <= seeded_ids
