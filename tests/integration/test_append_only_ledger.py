"""Append-only audit ledger against the isolated PostgreSQL test database.

The trigger tests are the point of this file: they are what turns "append-only"
from a claim in a docstring into something the database demonstrably enforces.
"""

import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.db.session import get_sessionmaker
from app.models import Document, WorkflowRun
from app.models.audit import AuditEvent
from app.services.audit_ledger import GENESIS_HASH, append_event, read_ledger, verify_ledger
from app.services.cases import CaseService
from app.services.reviews import ReviewService

pytestmark = pytest.mark.integration


async def _append(**kwargs) -> AuditEvent:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        event = await append_event(session, **kwargs)
        await session.commit()
        return event


async def _rows_for(case_id: str) -> list[AuditEvent]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        result = await session.execute(
            select(AuditEvent).where(AuditEvent.case_id == case_id).order_by(AuditEvent.sequence)
        )
        return list(result.scalars().all())


async def test_appending_two_events_links_prev_hash() -> None:
    case_id = f"ledger-{uuid.uuid4().hex[:8]}"
    first = await _append(
        event_type="TEST_LEDGER_EVENT",
        actor="system:test",
        summary="first event",
        case_id=case_id,
        entity_type="probe",
        entity_id="one",
        details={"b": 2, "a": 1},
    )
    second = await _append(
        event_type="TEST_LEDGER_EVENT",
        actor="system:test",
        summary="second event",
        case_id=case_id,
        entity_type="probe",
        entity_id="two",
    )

    assert second.sequence > first.sequence
    assert second.prev_hash == first.entry_hash
    assert len(first.entry_hash) == len(second.entry_hash) == 64

    stored = await _rows_for(case_id)
    assert [row.entry_hash for row in stored] == [first.entry_hash, second.entry_hash]
    assert stored[0].details == {"a": 1, "b": 2}

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        whole = await read_ledger(session)
    # The whole chain, not just this test's two rows, still verifies.
    assert verify_ledger(whole).valid is True
    assert whole[0].prev_hash == GENESIS_HASH


async def test_update_on_audit_events_raises() -> None:
    case_id = f"ledger-{uuid.uuid4().hex[:8]}"
    event = await _append(
        event_type="TEST_LEDGER_EVENT",
        actor="system:test",
        summary="immutable",
        case_id=case_id,
        entity_type="probe",
        entity_id="one",
    )

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        with pytest.raises(DBAPIError) as excinfo:
            await session.execute(
                text("UPDATE audit_events SET actor = 'forged' WHERE sequence = :sequence"),
                {"sequence": event.sequence},
            )
            await session.commit()
        assert "append-only" in str(excinfo.value)
        await session.rollback()

    unchanged = await _rows_for(case_id)
    assert [row.actor for row in unchanged] == ["system:test"]


async def test_delete_on_audit_events_raises() -> None:
    case_id = f"ledger-{uuid.uuid4().hex[:8]}"
    event = await _append(
        event_type="TEST_LEDGER_EVENT",
        actor="system:test",
        summary="undeletable",
        case_id=case_id,
        entity_type="probe",
        entity_id="one",
    )

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        with pytest.raises(DBAPIError) as excinfo:
            await session.execute(
                text("DELETE FROM audit_events WHERE sequence = :sequence"),
                {"sequence": event.sequence},
            )
            await session.commit()
        assert "append-only" in str(excinfo.value)
        await session.rollback()

    assert len(await _rows_for(case_id)) == 1


async def test_review_decision_writes_a_ledger_row() -> None:
    case_id = f"ledger-{uuid.uuid4().hex[:8]}"
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        await CaseService(session).create("Ledger fixture", case_id=case_id)
        run = WorkflowRun(
            workflow_type="document_compare",
            case_id=case_id,
            status="running",
            result={},
            steps=[],
            errors=[],
        )
        session.add(run)
        await session.commit()
        await session.refresh(run)
        workflow_id = str(run.id)

    reviews = ReviewService(sessionmaker)
    review_ids = await reviews.create_many(
        workflow_id, case_id, [{"type": "po_mismatch", "severity": "high"}]
    )
    review_id = review_ids[0]

    try:
        # Creating the case already appended a row; flagging a finding did not.
        assert [row.event_type for row in await _rows_for(case_id)] == ["CASE_CREATED"]

        await reviews.decide(
            uuid.UUID(review_id), "APPROVED", reviewer="Controller Kim", note="Checked the PO"
        )
        rows = await _rows_for(case_id)
        assert [row.event_type for row in rows] == ["CASE_CREATED", "FINDING_APPROVED"]

        decision = rows[-1]
        assert decision.actor == "Controller Kim"
        assert decision.entity_type == "review_finding"
        assert decision.entity_id == review_id
        assert decision.details["note"] == "Checked the PO"
        assert decision.details["status"] == "APPROVED"
        assert decision.prev_hash == rows[0].entry_hash

        await reviews.resolve(uuid.UUID(review_id))
        assert [row.event_type for row in await _rows_for(case_id)] == [
            "CASE_CREATED",
            "FINDING_APPROVED",
            "FINDING_RESOLVED",
        ]
    finally:
        async with sessionmaker() as session:
            await CaseService(session).delete(case_id)


async def test_ledger_rows_survive_deletion_of_the_case_they_describe() -> None:
    case_id = f"ledger-{uuid.uuid4().hex[:8]}"
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        await CaseService(session).create("Disappearing case", case_id=case_id)
    async with sessionmaker() as session:
        await CaseService(session).delete(case_id)

    # audit_events.case_id is deliberately not a foreign key: a cascade would
    # need a DELETE and SET NULL would need an UPDATE, and the trigger blocks both.
    rows = await _rows_for(case_id)
    assert [row.event_type for row in rows] == ["CASE_CREATED"]


async def test_audit_trail_api_labels_both_sources_and_reports_ledger_validity(client) -> None:
    case_id = f"ledger-{uuid.uuid4().hex[:8]}"
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        # CaseService.create writes a ledger row; this Document row is inserted
        # directly, so it can only ever be projected.
        await CaseService(session).create("Mixed sources", case_id=case_id)
        session.add(
            Document(
                filename="invoice_001.txt",
                content_sha256=uuid.uuid4().hex * 2,
                dedup_key=uuid.uuid4().hex * 2,
                mime_type="text/plain",
                size_bytes=64,
                page_count=1,
                document_type="invoice",
                case_id=case_id,
                status="parsed",
                parser_version="text-1",
                doc_metadata={},
            )
        )
        await session.commit()

    try:
        response = await client.get("/api/audit-trail", params={"case_id": case_id, "limit": 200})
        assert response.status_code == 200
        body = response.json()

        by_action = {entry["action"]: entry for entry in body["entries"]}
        assert by_action["CASE_CREATED"]["source"] == "ledger"
        assert by_action["CASE_CREATED"]["sequence"] is not None
        assert by_action["DOCUMENT_INGESTED"]["source"] == "projected"
        assert by_action["DOCUMENT_INGESTED"]["sequence"] is None
        # CASE_CREATED is not reported twice even though the projection can derive it.
        assert [entry["action"] for entry in body["entries"]].count("CASE_CREATED") == 1

        integrity = body["integrity"]
        assert integrity["ledger"]["append_only"] is True
        assert integrity["ledger"]["chain_valid"] is True
        assert integrity["ledger"]["first_broken_sequence"] is None
        assert integrity["ledger"]["chain_checked"] >= 1
        assert integrity["ledger"]["entries_in_result"] == 1
        assert integrity["projected"]["append_only"] is False
        assert integrity["projected"]["entries_in_result"] >= 1
        assert integrity["limitations"]
        assert body["chain_valid"] is integrity["ledger"]["chain_valid"]
        assert "source='projected'" in body["chain_note"]

        export = await client.get(
            "/api/audit-trail/export", params={"case_id": case_id, "format": "json"}
        )
        payload = export.json()
        assert {entry["source"] for entry in payload["entries"]} == {"ledger", "projected"}
        assert payload["integrity"]["ledger"]["chain_valid"] is True

        csv_export = await client.get(
            "/api/audit-trail/export", params={"case_id": case_id, "format": "csv"}
        )
        assert "source" in csv_export.text.splitlines()[0]
    finally:
        async with sessionmaker() as session:
            await CaseService(session).delete(case_id)
