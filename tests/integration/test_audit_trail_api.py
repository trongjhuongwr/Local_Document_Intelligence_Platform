"""Audit-trail API against real rows in the isolated PostgreSQL test database."""

import csv
import io
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete

from app.db.session import get_sessionmaker
from app.models import Document, WorkflowRun
from app.models.audit import AuditAttestation
from app.services.cases import CaseService
from app.services.reviews import ReviewService

pytestmark = pytest.mark.integration


async def _seed_case(case_id: str) -> dict[str, str]:
    """Create one case with a real document, workflow run, and review finding."""
    sessionmaker = get_sessionmaker()
    started = datetime.now(UTC) - timedelta(minutes=5)
    async with sessionmaker() as session:
        await CaseService(session).create("Audit trail fixture", case_id=case_id)
        document = Document(
            filename="invoice_001.txt",
            content_sha256=uuid.uuid4().hex * 2,
            dedup_key=uuid.uuid4().hex * 2,
            mime_type="text/plain",
            size_bytes=128,
            page_count=1,
            document_type="invoice",
            case_id=case_id,
            status="parsed",
            parser_version="text-1",
            doc_metadata={},
        )
        run = WorkflowRun(
            workflow_type="document_compare",
            case_id=case_id,
            status="completed",
            result={
                "issues": [{"type": "po_mismatch", "severity": "high"}],
                "extraction_failures": [],
            },
            steps=[],
            errors=[],
            requires_review=True,
            duration_ms=1500.0,
            started_at=started,
            completed_at=started + timedelta(seconds=12),
        )
        session.add_all([document, run])
        await session.commit()
        await session.refresh(document)
        await session.refresh(run)
        workflow_id = str(run.id)
        document_id = str(document.id)

    review_ids = await ReviewService(sessionmaker).create_many(
        workflow_id, case_id, [{"type": "po_mismatch", "severity": "high"}]
    )
    return {
        "document_id": document_id,
        "workflow_id": workflow_id,
        "review_id": review_ids[0],
    }


async def _cleanup(case_id: str) -> None:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        await session.execute(delete(AuditAttestation).where(AuditAttestation.case_id == case_id))
        await session.commit()
        await CaseService(session).delete(case_id)


async def test_audit_trail_projects_real_rows(client) -> None:
    case_id = f"audit-{uuid.uuid4().hex[:8]}"
    seeded = await _seed_case(case_id)
    try:
        approved = await client.post(
            f"/api/reviews/{seeded['review_id']}/approve",
            json={"reviewer": "Controller Kim", "note": "Verified against PO"},
        )
        assert approved.status_code == 200

        response = await client.get("/api/audit-trail", params={"case_id": case_id, "limit": 200})
        assert response.status_code == 200
        body = response.json()

        entries = body["entries"]
        assert body["total"] == len(entries)
        assert body["chain_valid"] is True

        actions = [entry["action"] for entry in entries]
        assert set(actions) == {
            "CASE_CREATED",
            "DOCUMENT_INGESTED",
            "WORKFLOW_STARTED",
            "WORKFLOW_COMPLETED",
            "FINDING_FLAGGED",
            "FINDING_APPROVED",
        }

        timestamps = [entry["timestamp"] for entry in entries]
        assert timestamps == sorted(timestamps, reverse=True)

        by_action = {entry["action"]: entry for entry in entries}

        ingested = by_action["DOCUMENT_INGESTED"]
        assert ingested["entity_id"] == seeded["document_id"]
        assert ingested["metadata"]["filename"] == "invoice_001.txt"
        assert ingested["metadata"]["size_bytes"] == 128

        completed = by_action["WORKFLOW_COMPLETED"]
        assert completed["entity_id"] == seeded["workflow_id"]
        assert completed["metadata"]["findings_count"] == 1
        assert completed["metadata"]["duration_ms"] == 1500.0

        decision = by_action["FINDING_APPROVED"]
        assert decision["entity_id"] == seeded["review_id"]
        assert decision["actor"] == "Controller Kim"
        assert decision["metadata"]["note"] == "Verified against PO"

        for entry in entries:
            assert entry["case_id"] == case_id
            assert entry["case_name"] == "Audit trail fixture"
            assert len(entry["integrity_hash"]) == 64
            assert len(entry["prev_hash"]) == 64
            assert entry["log_id"].startswith("AUD-")
    finally:
        await _cleanup(case_id)


async def test_audit_trail_filters_and_paginates(client) -> None:
    case_id = f"audit-{uuid.uuid4().hex[:8]}"
    await _seed_case(case_id)
    try:
        by_action = await client.get(
            "/api/audit-trail", params={"case_id": case_id, "action": "DOCUMENT_INGESTED"}
        )
        assert by_action.status_code == 200
        assert [entry["action"] for entry in by_action.json()["entries"]] == ["DOCUMENT_INGESTED"]

        by_search = await client.get(
            "/api/audit-trail", params={"case_id": case_id, "search": "invoice_001.txt"}
        )
        assert by_search.json()["total"] == 1

        no_match = await client.get(
            "/api/audit-trail", params={"case_id": case_id, "search": "no-such-thing"}
        )
        assert no_match.json()["entries"] == []
        assert no_match.json()["total"] == 0

        page = await client.get(
            "/api/audit-trail", params={"case_id": case_id, "limit": 2, "offset": 1}
        )
        page_body = page.json()
        assert page_body["count"] == 2
        assert page_body["total"] == 5  # five events, page of two
        assert page_body["offset"] == 1

        other_case = await client.get(
            "/api/audit-trail", params={"case_id": f"missing-{uuid.uuid4().hex[:6]}"}
        )
        assert other_case.json()["entries"] == []
    finally:
        await _cleanup(case_id)


async def test_manual_attestation_is_persisted_and_appears_in_the_ledger(client) -> None:
    case_id = f"audit-{uuid.uuid4().hex[:8]}"
    await _seed_case(case_id)
    try:
        created = await client.post(
            "/api/audit-trail",
            json={
                "case_id": case_id,
                "actor": "Senior Lead Auditor",
                "details": "Q1 variances reconciled against the master contract.",
                "metadata": {"standard": "SOX-404-Attestation"},
            },
        )
        assert created.status_code == 201
        assert created.json()["actor"] == "Senior Lead Auditor"

        response = await client.get(
            "/api/audit-trail", params={"case_id": case_id, "action": "MANUAL_ATTESTATION"}
        )
        entries = response.json()["entries"]
        assert len(entries) == 1
        entry = entries[0]
        assert entry["actor"] == "Senior Lead Auditor"
        assert entry["details"] == "Q1 variances reconciled against the master contract."
        assert entry["metadata"]["standard"] == "SOX-404-Attestation"
        assert entry["entity_type"] == "attestation"
        assert entry["entity_id"] == created.json()["attestation_id"]

        blank = await client.post(
            "/api/audit-trail", json={"case_id": case_id, "actor": "", "details": "x"}
        )
        assert blank.status_code == 422
    finally:
        await _cleanup(case_id)


async def test_audit_trail_csv_and_json_export(client) -> None:
    case_id = f"audit-{uuid.uuid4().hex[:8]}"
    await _seed_case(case_id)
    try:
        csv_response = await client.get(
            "/api/audit-trail/export", params={"case_id": case_id, "format": "csv"}
        )
        assert csv_response.status_code == 200
        assert csv_response.headers["content-type"].startswith("text/csv")
        assert "attachment;" in csv_response.headers["content-disposition"]
        assert case_id in csv_response.headers["content-disposition"]

        rows = list(csv.DictReader(io.StringIO(csv_response.text)))
        listed = await client.get("/api/audit-trail", params={"case_id": case_id, "limit": 500})
        assert len(rows) == listed.json()["total"]
        assert {row["case_id"] for row in rows} == {case_id}
        assert all(len(row["integrity_hash"]) == 64 for row in rows)

        json_response = await client.get(
            "/api/audit-trail/export", params={"case_id": case_id, "format": "json"}
        )
        assert json_response.status_code == 200
        assert json_response.headers["content-type"].startswith("application/json")
        assert "attachment;" in json_response.headers["content-disposition"]
        payload = json_response.json()
        assert payload["total"] == len(rows)
        assert payload["chain_valid"] is True
        assert payload["filters"]["case_id"] == case_id

        bad_format = await client.get(
            "/api/audit-trail/export", params={"case_id": case_id, "format": "xlsx"}
        )
        assert bad_format.status_code == 422
    finally:
        await _cleanup(case_id)
