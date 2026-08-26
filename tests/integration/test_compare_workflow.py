"""End-to-end compare workflow against live Postgres with a stubbed extractor."""

import uuid

import pytest

from app.db.session import get_sessionmaker
from app.extraction.schemas import ContractExtraction, InvoiceExtraction
from app.extraction.service import ExtractionOutcome
from app.ingestion.types import ChunkDraft
from app.llm.base import LLMTelemetry
from app.models import ReviewTask, WorkflowRun
from app.repositories.documents import DocumentRepository
from app.services.compare import CompareService
from app.services.reviews import ReviewService

pytestmark = pytest.mark.integration


class StubExtractionService:
    """Returns perfect extractions without touching Ollama."""

    def __init__(self, by_type: dict) -> None:
        self._by_type = by_type

    async def extract(self, document_type: str, document_text: str) -> ExtractionOutcome:
        return ExtractionOutcome(
            document_type=document_type,
            data=self._by_type[document_type],
            prompt_name=f"extraction_{document_type}",
            prompt_version="1",
            truncated=False,
            telemetry=LLMTelemetry(model="stub", temperature=0.0, success=True, schema_valid=True),
        )


async def _seed_documents(case_id: str) -> list[str]:
    sessionmaker = get_sessionmaker()
    ids = []
    async with sessionmaker() as session:
        repository = DocumentRepository(session)
        for document_type, filename, text in [
            ("contract", "service_contract.pdf", "Maximum aggregate fees: USD 75,000.00"),
            ("invoice", "invoice_001.pdf", "Total Due: USD 82,500.00"),
        ]:
            document = await repository.create(
                filename=filename,
                content_sha256=uuid.uuid4().hex + uuid.uuid4().hex,
                mime_type="application/pdf",
                size_bytes=1000,
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
                        token_estimate=10,
                        metadata={},
                    )
                ],
            )
            ids.append(str(document.id))
    return ids


async def test_compare_workflow_end_to_end() -> None:
    case_id = f"it_case_{uuid.uuid4().hex[:8]}"
    await _seed_documents(case_id)

    extractions = {
        "contract": ContractExtraction(
            vendor_name="Acme Analytics Ltd",
            currency="USD",
            maximum_amount=75000.0,
            payment_terms="Net 30",
            effective_date="2025-01-01",
            expiration_date="2026-01-01",
        ),
        "invoice": InvoiceExtraction(
            invoice_number="INV-IT-1",
            vendor_name="Acme Analytics Ltd",
            currency="USD",
            subtotal=80000.0,
            tax_rate_percent=3.125,
            tax=2500.0,
            total=82500.0,
            issue_date="2025-06-01",
            due_date="2025-07-01",
            payment_terms="Net 30",
            po_reference="PO-IT-1",
        ),
    }
    sessionmaker = get_sessionmaker()
    service = CompareService(
        sessionmaker,
        StubExtractionService(extractions),  # type: ignore[arg-type]
        ReviewService(sessionmaker),
    )

    result = await service.run(case_id=case_id)

    assert result["status"] == "completed"
    assert result["requires_human_review"] is True
    types = {d["type"] for d in result["discrepancies"]}
    assert "amount_exceeds_contract" in types
    assert result["review_task_ids"]
    assert result["report"]["issues"]
    assert "# Exception Report" in result["report_markdown"]

    async with sessionmaker() as session:
        run = await session.get(WorkflowRun, uuid.UUID(result["workflow_id"]))
        assert run is not None
        assert run.status == "completed"
        assert run.requires_review is True
        assert next(step["step"] for step in run.steps) == "load_documents"

        task = await session.get(ReviewTask, uuid.UUID(result["review_task_ids"][0]))
        assert task is not None
        assert task.status == "OPEN"
        assert task.case_id == case_id


async def test_review_decision_lifecycle() -> None:
    sessionmaker = get_sessionmaker()
    reviews = ReviewService(sessionmaker)
    [task_id] = await reviews.create_many(
        None,
        "it_case_reviews",
        [{"type": "amount_exceeds_contract", "severity": "high", "description": "test"}],
    )
    task = await reviews.decide(
        uuid.UUID(task_id), "APPROVED", reviewer="tester", note="confirmed overbilling"
    )
    assert task.status == "APPROVED"
    assert task.reviewer == "tester"
    assert task.decided_at is not None

    resolved = await reviews.resolve(uuid.UUID(task_id))
    assert resolved.status == "RESOLVED"


async def test_async_analysis_reuses_active_run_and_persists_progress() -> None:
    case_id = f"async_case_{uuid.uuid4().hex[:8]}"
    await _seed_documents(case_id)
    service = CompareService(
        get_sessionmaker(),
        StubExtractionService(
            {
                "contract": ContractExtraction(
                    vendor_name="Acme Analytics Ltd",
                    currency="USD",
                    maximum_amount=100000.0,
                    payment_terms="Net 30",
                ),
                "invoice": InvoiceExtraction(
                    invoice_number="INV-ASYNC-1",
                    vendor_name="Acme Analytics Ltd",
                    currency="USD",
                    total=5000.0,
                    payment_terms="Net 30",
                ),
            }
        ),  # type: ignore[arg-type]
        ReviewService(get_sessionmaker()),
    )
    first = await service.create_analysis(case_id)
    second = await service.create_analysis(case_id)
    assert first.id == second.id
    assert first.status == "queued"

    await service.run_analysis(first.id)
    async with get_sessionmaker()() as session:
        completed = await session.get(WorkflowRun, first.id)
        assert completed is not None
        assert completed.status == "completed"
        assert all(step["status"] == "completed" for step in completed.steps)
        assert completed.started_at is not None
        assert completed.completed_at is not None
