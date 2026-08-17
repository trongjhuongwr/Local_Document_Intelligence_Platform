"""Integration tests for the documents API against a live PostgreSQL instance."""

import io
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

from app.db.session import get_engine
from app.services.documents import UPLOAD_DIR

pytestmark = pytest.mark.integration

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module", autouse=True)
def apply_migrations():
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
async def dispose_engine():
    # Each test runs in its own event loop; dispose pooled asyncpg connections
    # afterwards so the next loop starts clean.
    yield
    await get_engine().dispose()


def make_pdf(marker: str) -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=LETTER)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(72, 750, "Integration Test Document")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(72, 700, f"Unique marker {marker} embedded in the body.")
    pdf.drawString(72, 686, "This document exercises the ingestion pipeline end to end.")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


async def test_upload_duplicate_get_chunks_delete(client):
    marker = uuid.uuid4().hex
    case_id = f"case-{marker[:12]}"
    data = make_pdf(marker)
    filename = f"integration-{marker}.pdf"

    response = await client.post(
        "/documents",
        files={"file": (filename, data, "application/pdf")},
        data={"document_type": "invoice", "case_id": case_id},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["duplicate"] is False
    assert body["status"] == "parsed"
    assert body["mime_type"] == "application/pdf"
    assert body["page_count"] == 1
    assert body["chunk_count"] >= 1
    assert body["sha256"]
    document_id = body["document_id"]

    # Uploading identical bytes again returns the existing document, no new row.
    response = await client.post(
        "/documents",
        files={"file": (filename, data, "application/pdf")},
        data={"case_id": case_id},
    )
    assert response.status_code == 201
    duplicate_body = response.json()
    assert duplicate_body["duplicate"] is True
    assert duplicate_body["document_id"] == document_id
    assert duplicate_body["chunk_count"] == body["chunk_count"]

    listed = await client.get("/documents", params={"case_id": case_id})
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 1
    assert items[0]["document_id"] == document_id

    detail = await client.get(f"/documents/{document_id}")
    assert detail.status_code == 200
    detail_body = detail.json()
    assert detail_body["chunk_count"] == body["chunk_count"]
    assert detail_body["element_count"] >= 1
    assert detail_body["document_type"] == "invoice"
    assert detail_body["case_id"] == case_id
    assert detail_body["doc_metadata"]["original_filename"] == filename

    chunks_response = await client.get(f"/documents/{document_id}/chunks")
    assert chunks_response.status_code == 200
    chunks = chunks_response.json()
    assert len(chunks) == body["chunk_count"]
    assert [chunk["order_index"] for chunk in chunks] == list(range(len(chunks)))
    assert any(marker in chunk["text"] for chunk in chunks)
    assert all(chunk["page_number"] == 1 for chunk in chunks)

    stored = list(UPLOAD_DIR.glob(f"{document_id}.*"))
    assert len(stored) == 1

    delete_response = await client.delete(f"/documents/{document_id}")
    assert delete_response.status_code == 204
    assert (await client.get(f"/documents/{document_id}")).status_code == 404
    assert (await client.get(f"/documents/{document_id}/chunks")).status_code == 404
    assert list(UPLOAD_DIR.glob(f"{document_id}.*")) == []


async def test_list_filters(client):
    marker = uuid.uuid4().hex
    case_id = f"case-{marker[:12]}"
    data = f"Filter test paragraph with marker {marker}.\n\nSecond paragraph.".encode()

    response = await client.post(
        "/documents",
        files={"file": (f"filters-{marker}.txt", data, "text/plain")},
        data={"document_type": "policy", "case_id": case_id},
    )
    assert response.status_code == 201, response.text
    document_id = response.json()["document_id"]

    by_type = await client.get("/documents", params={"case_id": case_id, "document_type": "policy"})
    assert [item["document_id"] for item in by_type.json()] == [document_id]

    wrong_type = await client.get(
        "/documents", params={"case_id": case_id, "document_type": "invoice"}
    )
    assert wrong_type.json() == []

    by_status = await client.get("/documents", params={"case_id": case_id, "status": "parsed"})
    assert len(by_status.json()) == 1

    offset_page = await client.get("/documents", params={"case_id": case_id, "offset": 1})
    assert offset_page.json() == []

    cleanup = await client.delete(f"/documents/{document_id}")
    assert cleanup.status_code == 204


async def test_unsupported_and_corrupt_uploads(client):
    marker = uuid.uuid4().hex

    unsupported = await client.post(
        "/documents",
        files={
            "file": (
                f"garbage-{marker}.bin",
                b"\x00\xff\xfe\x01" + marker.encode(),
                "application/octet-stream",
            )
        },
    )
    assert unsupported.status_code == 415
    assert unsupported.json()["error"] == "unsupported_document"

    corrupt = await client.post(
        "/documents",
        files={
            "file": (
                f"broken-{marker}.pdf",
                b"%PDF-1.7\nbroken " + marker.encode(),
                "application/pdf",
            )
        },
    )
    assert corrupt.status_code == 422
    assert corrupt.json()["error"] == "document_parse_error"
