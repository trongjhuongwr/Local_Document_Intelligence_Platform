"""Integration tests for GET /api/documents/{id}/extraction against live PostgreSQL."""

import io
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

from app.db.session import get_engine, get_sessionmaker
from app.models import ExtractionRun

pytestmark = pytest.mark.integration

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module", autouse=True)
def apply_migrations():
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
async def dispose_engine():
    yield
    await get_engine().dispose()


def make_invoice_pdf(marker: str) -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=LETTER)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(72, 750, "INVOICE")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(72, 720, f"Invoice Number: INV-{marker[:8]}")
    pdf.drawString(72, 706, "Subtotal: USD 8,050.00")
    pdf.drawString(72, 692, "Tax (5%): USD 402.50")
    pdf.drawString(72, 678, "Total Due: USD 8,452.50")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


async def _upload(client, marker: str) -> str:
    response = await client.post(
        "/api/documents",
        files={"file": (f"invoice-{marker}.pdf", make_invoice_pdf(marker), "application/pdf")},
        data={"document_type": "invoice", "case_id": f"case-{marker[:12]}"},
    )
    assert response.status_code == 201, response.text
    return response.json()["document_id"]


async def test_reports_not_extracted_before_any_run(client) -> None:
    document_id = await _upload(client, uuid.uuid4().hex)

    response = await client.get(f"/api/documents/{document_id}/extraction")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["extracted"] is False
    assert body["fields"] == {}
    assert body["extracted_at"] is None
    assert body["document_id"] == document_id


async def test_returns_the_latest_schema_valid_extraction(client) -> None:
    marker = uuid.uuid4().hex
    document_id = await _upload(client, marker)

    async with get_sessionmaker()() as session:
        # An older failed run must never be served...
        session.add(
            ExtractionRun(
                document_id=uuid.UUID(document_id),
                document_type="invoice",
                data={},
                method="ollama_structured",
                prompt_name="extraction_invoice",
                prompt_version="2",
                schema_valid=False,
                telemetry={"error": "schema validation failed"},
            )
        )
        # ...while the valid run is.
        session.add(
            ExtractionRun(
                document_id=uuid.UUID(document_id),
                document_type="invoice",
                data={"invoice_number": f"INV-{marker[:8]}", "tax_rate_percent": 5.0},
                method="ollama_structured",
                prompt_name="extraction_invoice",
                prompt_version="2",
                schema_valid=True,
                telemetry={"model": "llama3.2:1b"},
            )
        )
        await session.commit()

    response = await client.get(f"/api/documents/{document_id}/extraction")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["extracted"] is True
    assert body["fields"]["tax_rate_percent"] == 5.0
    assert body["fields"]["invoice_number"] == f"INV-{marker[:8]}"
    assert body["prompt_name"] == "extraction_invoice"
    assert body["extracted_at"] is not None


async def test_unknown_document_is_reported_as_not_found(client) -> None:
    response = await client.get(f"/api/documents/{uuid.uuid4()}/extraction")

    assert response.status_code == 404
    assert response.json()["error"] == "document_not_found"
