"""Unit tests for the audit-trail projection, hash chain, filters, and CSV export.

No database: the ORM instances are constructed in memory, which is exactly the
input the projection functions take.
"""

import csv
import io
import json
import uuid
from datetime import UTC, datetime, timedelta

from app.models import Document, QueryRun, ReviewTask, WorkflowRun
from app.models.audit import AuditAttestation
from app.models.audit import AuditEvent as AuditEventRow
from app.models.case import Case
from app.services.audit import (
    GENESIS_HASH,
    AuditEvent,
    attestation_event,
    build_ledger,
    case_event,
    document_event,
    entries_to_csv,
    filter_entries,
    ledger_entry,
    merge_trail,
    query_event,
    review_events,
    verify_ledger,
    workflow_events,
)
from app.services.audit_ledger import compute_entry_hash, event_payload

BASE = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)


def _event(offset_minutes: int, action: str, entity_id: str, **kwargs) -> AuditEvent:
    return AuditEvent(
        timestamp=BASE + timedelta(minutes=offset_minutes),
        action=action,
        actor=kwargs.pop("actor", "system:test"),
        entity_type=kwargs.pop("entity_type", "document"),
        entity_id=entity_id,
        details=kwargs.pop("details", f"{action} on {entity_id}"),
        case_id=kwargs.pop("case_id", "case-1"),
        metadata=kwargs.pop("metadata", {}),
    )


def test_ledger_is_reverse_chronological_and_chained() -> None:
    entries = build_ledger(
        [
            _event(10, "DOCUMENT_INGESTED", "doc-b"),
            _event(0, "CASE_CREATED", "case-1", entity_type="case"),
            _event(20, "WORKFLOW_COMPLETED", "wf-1", entity_type="workflow"),
        ],
        {"case-1": "Acme review"},
    )

    assert [entry["action"] for entry in entries] == [
        "WORKFLOW_COMPLETED",
        "DOCUMENT_INGESTED",
        "CASE_CREATED",
    ]
    # oldest entry links to the genesis hash
    assert entries[-1]["prev_hash"] == GENESIS_HASH
    # each newer entry links to the hash of the one before it
    assert entries[1]["prev_hash"] == entries[2]["integrity_hash"]
    assert entries[0]["prev_hash"] == entries[1]["integrity_hash"]
    assert all(len(entry["integrity_hash"]) == 64 for entry in entries)
    assert all(entry["case_name"] == "Acme review" for entry in entries)
    assert verify_ledger(entries) is True


def test_ledger_is_deterministic_for_the_same_rows() -> None:
    events = [_event(5, "DOCUMENT_INGESTED", "doc-a"), _event(1, "CASE_CREATED", "case-1")]
    first = build_ledger(events)
    second = build_ledger(list(reversed(events)))
    assert [entry["integrity_hash"] for entry in first] == [
        entry["integrity_hash"] for entry in second
    ]
    assert [entry["log_id"] for entry in first] == [entry["log_id"] for entry in second]


def test_verify_ledger_detects_tampered_content() -> None:
    entries = build_ledger([_event(0, "CASE_CREATED", "case-1"), _event(1, "X", "doc-a")])
    assert verify_ledger(entries) is True
    entries[0]["details"] = "edited after the fact"
    assert verify_ledger(entries) is False


def test_verify_ledger_detects_broken_link() -> None:
    entries = build_ledger([_event(0, "A", "one"), _event(1, "B", "two")])
    entries[0]["prev_hash"] = "f" * 64
    assert verify_ledger(entries) is False


def test_log_ids_are_stable_and_unique_per_event() -> None:
    entries = build_ledger(
        [
            _event(0, "FINDING_APPROVED", "rev-1", entity_type="review_finding"),
            _event(0, "FINDING_REJECTED", "rev-1", entity_type="review_finding"),
        ]
    )
    log_ids = {entry["log_id"] for entry in entries}
    assert len(log_ids) == 2
    assert all(entry["log_id"].startswith("AUD-") for entry in entries)


def test_filter_entries_by_case_action_and_search() -> None:
    entries = build_ledger(
        [
            _event(0, "DOCUMENT_INGESTED", "doc-a", details="Document 'invoice.pdf' ingested"),
            _event(1, "DOCUMENT_INGESTED", "doc-b", case_id="case-2", details="other case"),
            _event(2, "FINDING_APPROVED", "rev-1", actor="Controller Kim"),
        ]
    )

    assert len(filter_entries(entries, case_id="case-2")) == 1
    assert len(filter_entries(entries, action="DOCUMENT_INGESTED")) == 2
    assert len(filter_entries(entries, action="document_ingested")) == 2
    assert len(filter_entries(entries, search="invoice.pdf")) == 1
    assert len(filter_entries(entries, search="controller")) == 1
    assert len(filter_entries(entries, search="nothing-matches-this")) == 0
    # filtering never mutates the source ledger
    assert len(entries) == 3


def test_filter_entries_can_search_by_integrity_hash() -> None:
    entries = build_ledger([_event(0, "A", "one"), _event(1, "B", "two")])
    target = entries[0]["integrity_hash"]
    found = filter_entries(entries, search=target[:16])
    assert len(found) == 1
    assert found[0]["integrity_hash"] == target


def test_entries_to_csv_round_trips_every_column() -> None:
    entries = build_ledger(
        [_event(0, "DOCUMENT_INGESTED", "doc-a", metadata={"filename": "invoice.pdf"})],
        {"case-1": "Acme, Inc."},
    )
    rows = list(csv.DictReader(io.StringIO(entries_to_csv(entries))))
    assert len(rows) == 1
    row = rows[0]
    assert row["action"] == "DOCUMENT_INGESTED"
    assert row["case_name"] == "Acme, Inc."
    assert row["integrity_hash"] == entries[0]["integrity_hash"]
    assert json.loads(row["metadata"]) == {"filename": "invoice.pdf"}


def test_document_projection_uses_only_recorded_columns() -> None:
    document = Document(
        id=uuid.uuid4(),
        filename="invoice_001.pdf",
        content_sha256="a" * 64,
        dedup_key="b" * 64,
        mime_type="application/pdf",
        size_bytes=2048,
        page_count=2,
        document_type="invoice",
        case_id="case-1",
        status="parsed",
        parser_version="pdf-1",
        doc_metadata={},
        created_at=BASE,
    )
    event = document_event(document)
    assert event.action == "DOCUMENT_INGESTED"
    assert event.entity_type == "document"
    assert event.metadata["sha256"] == "a" * 64
    assert event.metadata["size_bytes"] == 2048
    assert "invoice_001.pdf" in event.details
    assert "error_message" not in event.metadata  # None values are dropped, not invented


def test_workflow_projection_yields_start_and_terminal_events() -> None:
    run = WorkflowRun(
        id=uuid.uuid4(),
        workflow_type="document_compare",
        case_id="case-1",
        status="completed",
        result={"issues": [{"type": "po_mismatch"}, {"type": "wrong_currency"}]},
        steps=[],
        errors=[],
        requires_review=True,
        duration_ms=1234.5,
        created_at=BASE,
        started_at=BASE,
        completed_at=BASE + timedelta(seconds=12),
    )
    events = workflow_events(run)
    assert [event.action for event in events] == ["WORKFLOW_STARTED", "WORKFLOW_COMPLETED"]
    assert events[1].metadata["findings_count"] == 2
    assert events[1].metadata["duration_ms"] == 1234.5


def test_workflow_projection_reports_failure_reason() -> None:
    run = WorkflowRun(
        id=uuid.uuid4(),
        workflow_type="document_compare",
        case_id="case-1",
        status="failed",
        result={},
        steps=[],
        errors=["extraction timed out"],
        requires_review=False,
        created_at=BASE,
        completed_at=BASE + timedelta(seconds=3),
    )
    events = workflow_events(run)
    assert events[1].action == "WORKFLOW_FAILED"
    assert "extraction timed out" in events[1].details


def test_running_workflow_has_no_terminal_event() -> None:
    run = WorkflowRun(
        id=uuid.uuid4(),
        workflow_type="document_compare",
        case_id="case-1",
        status="running",
        result={},
        steps=[],
        errors=[],
        requires_review=False,
        created_at=BASE,
        started_at=BASE,
    )
    assert [event.action for event in workflow_events(run)] == ["WORKFLOW_STARTED"]


def test_review_projection_records_reviewer_identity() -> None:
    task = ReviewTask(
        id=uuid.uuid4(),
        workflow_run_id=None,
        case_id="case-1",
        discrepancy={"type": "po_mismatch", "severity": "high"},
        severity="high",
        status="APPROVED",
        reviewer="Controller Kim",
        note="Verified against PO",
        decided_at=BASE + timedelta(minutes=5),
        created_at=BASE,
    )
    events = review_events(task)
    assert [event.action for event in events] == ["FINDING_FLAGGED", "FINDING_APPROVED"]
    assert events[1].actor == "Controller Kim"
    assert events[1].metadata["note"] == "Verified against PO"


def test_open_review_has_no_decision_event() -> None:
    task = ReviewTask(
        id=uuid.uuid4(),
        case_id="case-1",
        discrepancy={"type": "duplicate_invoice"},
        severity="medium",
        status="OPEN",
        created_at=BASE,
    )
    assert [event.action for event in review_events(task)] == ["FINDING_FLAGGED"]


def test_query_projection_reports_real_verification_state() -> None:
    run = QueryRun(
        id=uuid.uuid4(),
        query="What is the invoice total?",
        route="factual_rag",
        routing_method="keyword",
        answer="USD 4200",
        citations={"1": {"filename": "invoice.pdf"}},
        verification={"valid": True},
        retrieval_mode="bm25",
        context_chars=900,
        latency_ms=812.5,
        created_at=BASE,
    )
    event = query_event(run)
    assert event.action == "QUERY_EXECUTED"
    assert event.case_id is None  # query_runs does not record a case
    assert event.metadata["citation_count"] == 1
    assert event.metadata["citations_valid"] is True


def test_case_and_attestation_projections() -> None:
    case = Case(case_id="case-1", name="Acme review", source="user", created_at=BASE)
    assert case_event(case).action == "CASE_CREATED"
    assert case_event(case).actor == "system:user"

    attestation = AuditAttestation(
        id=uuid.uuid4(),
        case_id="case-1",
        actor="Senior Lead Auditor",
        details="Q1 variances reconciled.",
        attestation_metadata={"standard": "SOX-404-Attestation"},
        created_at=BASE,
    )
    event = attestation_event(attestation)
    assert event.action == "MANUAL_ATTESTATION"
    assert event.actor == "Senior Lead Auditor"
    assert event.metadata["standard"] == "SOX-404-Attestation"


def test_naive_and_aware_timestamps_order_together() -> None:
    entries = build_ledger(
        [
            AuditEvent(
                timestamp=datetime(2026, 3, 1, 9, 0),  # naive, treated as UTC
                action="A",
                actor="system",
                entity_type="document",
                entity_id="one",
                details="first",
            ),
            AuditEvent(
                timestamp=datetime(2026, 3, 1, 10, 0, tzinfo=UTC),
                action="B",
                actor="system",
                entity_type="document",
                entity_id="two",
                details="second",
            ),
        ]
    )
    assert [entry["action"] for entry in entries] == ["B", "A"]
    assert entries[0]["timestamp"].endswith("+00:00")


# --------------------------------------------------------------------------
# Merging the append-only ledger with the read-time projection
# --------------------------------------------------------------------------


def _ledger_row(sequence: int, minute: int, action: str, entity_id: str, **kwargs) -> AuditEventRow:
    """One stored ledger row, chained the way append_event would have written it."""
    payload = event_payload(
        occurred_at=BASE + timedelta(minutes=minute),
        event_type=action,
        actor=kwargs.get("actor", "system:test"),
        summary=kwargs.get("summary", f"{action} on {entity_id}"),
        case_id=kwargs.get("case_id", "case-1"),
        entity_type=kwargs.get("entity_type", "document"),
        entity_id=entity_id,
        details=kwargs.get("details", {}),
    )
    prev_hash = kwargs.get("prev_hash", GENESIS_HASH)
    return AuditEventRow(
        id=uuid.uuid4(),
        sequence=sequence,
        occurred_at=BASE + timedelta(minutes=minute),
        event_type=action,
        actor=payload["actor"],
        case_id=payload["case_id"],
        entity_type=payload["entity_type"],
        entity_id=entity_id,
        summary=payload["summary"],
        details=payload["details"],
        prev_hash=prev_hash,
        entry_hash=compute_entry_hash(prev_hash, payload),
    )


def _chained_rows(*specs) -> list[AuditEventRow]:
    """Each spec is ``(minute, action, entity_id)`` with an optional kwargs dict."""
    rows: list[AuditEventRow] = []
    prev_hash = GENESIS_HASH
    for sequence, spec in enumerate(specs, start=1):
        minute, action, entity_id, *rest = spec
        overrides = dict(rest[0]) if rest else {}
        row = _ledger_row(sequence, minute, action, entity_id, prev_hash=prev_hash, **overrides)
        rows.append(row)
        prev_hash = row.entry_hash
    return rows


def test_merge_labels_every_entry_with_its_source() -> None:
    rows = _chained_rows((5, "FINDING_APPROVED", "rev-1"))
    trail = merge_trail(rows, [_event(0, "DOCUMENT_INGESTED", "doc-a")], {"case-1": "Acme review"})

    assert [entry["source"] for entry in trail.entries] == ["ledger", "projected"]
    assert trail.ledger_count == 1
    assert trail.projected_count == 1
    assert trail.ledger_verification.valid is True
    assert trail.projection_chain_valid is True
    assert all(entry["case_name"] == "Acme review" for entry in trail.entries)


def test_merge_drops_the_projection_of_an_action_the_ledger_already_records() -> None:
    rows = _chained_rows((5, "FINDING_APPROVED", "rev-1", {"entity_type": "review_finding"}))
    projected = [
        _event(5, "FINDING_APPROVED", "rev-1", entity_type="review_finding"),
        _event(1, "FINDING_FLAGGED", "rev-1", entity_type="review_finding"),
    ]
    trail = merge_trail(rows, projected)

    assert trail.ledger_count == 1
    assert trail.projected_count == 1  # the duplicated decision is gone, the flag survives
    assert [(entry["action"], entry["source"]) for entry in trail.entries] == [
        ("FINDING_APPROVED", "ledger"),
        ("FINDING_FLAGGED", "projected"),
    ]


def test_merge_keeps_the_projection_chain_self_consistent_after_deduplication() -> None:
    rows = _chained_rows((2, "DOCUMENT_INGESTED", "doc-b"))
    projected = [
        _event(1, "DOCUMENT_INGESTED", "doc-a"),
        _event(2, "DOCUMENT_INGESTED", "doc-b"),
        _event(3, "DOCUMENT_INGESTED", "doc-c"),
    ]
    trail = merge_trail(rows, projected)

    surviving = [entry for entry in trail.entries if entry["source"] == "projected"]
    assert [entry["entity_id"] for entry in surviving] == ["doc-c", "doc-a"]
    assert verify_ledger(surviving) is True
    assert trail.projection_chain_valid is True


def test_merge_is_reverse_chronological_across_both_sources() -> None:
    rows = _chained_rows((10, "A", "one"), (30, "B", "two"))
    projected = [_event(20, "C", "three"), _event(40, "D", "four")]
    trail = merge_trail(rows, projected)

    assert [entry["action"] for entry in trail.entries] == ["D", "B", "C", "A"]
    timestamps = [entry["timestamp"] for entry in trail.entries]
    assert timestamps == sorted(timestamps, reverse=True)


def test_merge_reports_a_broken_ledger_without_touching_the_projection() -> None:
    rows = _chained_rows((1, "A", "one"), (2, "B", "two"))
    rows[1].actor = "tampered"
    trail = merge_trail(rows, [_event(3, "C", "three")])

    assert trail.ledger_verification.valid is False
    assert trail.ledger_verification.first_broken_sequence == 2
    assert trail.projection_chain_valid is True  # the two chains are reported separately
    assert trail.ledger_count == 2  # broken rows are still shown, not hidden


def test_ledger_entries_expose_the_stored_hashes() -> None:
    rows = _chained_rows((5, "CASE_CREATED", "case-1", {"entity_type": "case"}))
    entry = ledger_entry(rows[0], {"case-1": "Acme review"})

    assert entry["source"] == "ledger"
    assert entry["sequence"] == 1
    assert entry["prev_hash"] == GENESIS_HASH
    assert entry["integrity_hash"] == rows[0].entry_hash
    assert entry["log_id"] == f"AUD-{rows[0].entry_hash[:16].upper()}"
    assert entry["action"] == "CASE_CREATED"
    assert entry["case_name"] == "Acme review"


def test_merge_with_an_empty_ledger_is_the_old_projection_only_behaviour() -> None:
    projected = [_event(0, "A", "one"), _event(1, "B", "two")]
    trail = merge_trail([], projected)

    assert trail.ledger_count == 0
    assert trail.projected_count == 2
    assert trail.ledger_verification.checked == 0
    assert trail.ledger_verification.valid is True
    assert [entry["source"] for entry in trail.entries] == ["projected", "projected"]
    assert [entry["log_id"] for entry in trail.entries] == [
        entry["log_id"] for entry in build_ledger(projected)
    ]
