"""Audit trail: read-time projection, plus the merge with the append-only ledger.

Two kinds of entry reach the API, and they are labelled so nobody has to guess
which is which:

``source="ledger"``
    A row appended to ``audit_events`` at the moment the action happened, by
    :mod:`app.services.audit_ledger`. The table rejects ``UPDATE`` and ``DELETE``
    via a trigger and the rows are hash-chained, so these entries are
    tamper-evident. See :class:`app.models.audit.AuditEvent` for the precise
    limits of that claim.

``source="projected"``
    Derived here, at read time, from a real row in ``cases``, ``documents``,
    ``workflow_runs``, ``review_tasks``, ``query_runs`` or
    ``audit_attestations``. Nothing is synthesised: if a value is not recorded by
    the system it is left out of the event rather than invented. But a projection
    is a *reconstruction of the current state of a mutable row*, not a record of
    what happened. Its SHA-256 chain is recomputed on every request, so it proves
    the response is internally consistent and lets any client re-derive the same
    digests from the same rows — it does **not** prove the source rows were never
    modified. Everything the platform recorded before the ledger existed can only
    ever be projected.

Deduplication rule
------------------
:func:`merge_trail` drops a projected entry when the ledger already holds an
entry with the same ``(action, entity_type, entity_id)`` triple, so an action
that now writes a ledger row is never also reported as a projection. Identity is
used rather than a cutover timestamp because it is exact: a cutover would drop
genuine older events whose rows happen to be inserted after the first ledger row
(bulk imports, back-dated fixtures, rows written directly by tooling), and would
keep double-reporting anything the cutover misordered.

The rule assumes ``entity_id`` uniquely identifies the thing an event is about
within its ``entity_type``, which holds here: every id is a UUID primary key or a
case id. Events that are not distinguished by that triple (there are none today)
would be reported twice.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Case, Document, QueryRun, ReviewTask, WorkflowRun
from app.models.audit import AuditAttestation
from app.models.audit import AuditEvent as AuditEventRow
from app.services.audit_ledger import (
    GENESIS_HASH,
    LedgerVerification,
    append_event,
    read_ledger,
)
from app.services.audit_ledger import verify_ledger as verify_ledger_rows

LEDGER_SOURCE = "ledger"
PROJECTED_SOURCE = "projected"

MAX_SOURCE_ROWS = 2_000
"""Newest rows read per source table when projecting the ledger."""

SYSTEM_INGESTION_ACTOR = "system:ingestion"
SYSTEM_WORKFLOW_ACTOR = "system:workflow"
SYSTEM_QA_ACTOR = "system:qa"
UNKNOWN_REVIEWER = "unknown reviewer"

CORE_FIELDS: tuple[str, ...] = (
    "timestamp",
    "action",
    "actor",
    "case_id",
    "entity_type",
    "entity_id",
    "details",
    "metadata",
)
"""Fields that participate in the integrity hash (``case_name`` is a display join)."""

ENTRY_FIELDS: tuple[str, ...] = (
    "log_id",
    "source",
    "sequence",
    "timestamp",
    "action",
    "actor",
    "case_id",
    "case_name",
    "entity_type",
    "entity_id",
    "details",
    "metadata",
    "prev_hash",
    "integrity_hash",
)

CSV_COLUMNS: tuple[str, ...] = ENTRY_FIELDS


def _as_utc(value: datetime) -> datetime:
    return value.astimezone(UTC) if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _canonical(payload: Mapping[str, Any]) -> str:
    return json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str
    )


def _chain_hash(prev_hash: str, core: Mapping[str, Any]) -> str:
    return hashlib.sha256(f"{prev_hash}{_canonical(core)}".encode()).hexdigest()


def _log_id(core: Mapping[str, Any]) -> str:
    return f"AUD-{hashlib.sha256(_canonical(core).encode()).hexdigest()[:16].upper()}"


def _clean_metadata(metadata: Mapping[str, Any]) -> dict[str, Any]:
    """Drop keys whose value the system does not actually record."""
    return {key: value for key, value in metadata.items() if value is not None}


@dataclass(frozen=True)
class AuditEvent:
    """One projected event, before it is placed in the hash chain."""

    timestamp: datetime
    action: str
    actor: str
    entity_type: str
    entity_id: str
    details: str
    case_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def core(self) -> dict[str, Any]:
        return {
            "timestamp": _as_utc(self.timestamp).isoformat(),
            "action": self.action,
            "actor": self.actor,
            "case_id": self.case_id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "details": self.details,
            "metadata": self.metadata,
        }

    def sort_key(self) -> tuple[datetime, str, str]:
        return (_as_utc(self.timestamp), self.action, self.entity_id)


# --------------------------------------------------------------------------
# Pure ledger operations
# --------------------------------------------------------------------------


def build_ledger(
    events: Iterable[AuditEvent], case_names: Mapping[str, str] | None = None
) -> list[dict[str, Any]]:
    """Chain events oldest-to-newest, then return them newest-first."""
    names = case_names or {}
    ordered = sorted(events, key=lambda event: event.sort_key())
    entries: list[dict[str, Any]] = []
    prev_hash = GENESIS_HASH
    for event in ordered:
        core = event.core()
        integrity_hash = _chain_hash(prev_hash, core)
        entries.append(
            {
                "log_id": _log_id(core),
                "source": PROJECTED_SOURCE,
                "sequence": None,
                **core,
                "case_name": names.get(event.case_id) if event.case_id else None,
                "prev_hash": prev_hash,
                "integrity_hash": integrity_hash,
            }
        )
        prev_hash = integrity_hash
    entries.reverse()
    return entries


def verify_ledger(entries: Sequence[Mapping[str, Any]]) -> bool:
    """Recompute the chain over a complete newest-first ledger."""
    prev_hash = GENESIS_HASH
    for entry in reversed(entries):
        if entry.get("prev_hash") != prev_hash:
            return False
        core = {name: entry.get(name) for name in CORE_FIELDS}
        expected = _chain_hash(prev_hash, core)
        if entry.get("integrity_hash") != expected:
            return False
        prev_hash = expected
    return True


def ledger_entry(row: AuditEventRow, case_names: Mapping[str, str] | None = None) -> dict[str, Any]:
    """Render one stored ledger row in the same shape as a projected entry."""
    names = case_names or {}
    prev_hash = row.prev_hash or GENESIS_HASH
    return {
        "log_id": f"AUD-{row.entry_hash[:16].upper()}",
        "source": LEDGER_SOURCE,
        "sequence": row.sequence,
        "timestamp": _as_utc(row.occurred_at).isoformat(),
        "action": row.event_type,
        "actor": row.actor,
        "case_id": row.case_id,
        "case_name": names.get(row.case_id) if row.case_id else None,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "details": row.summary,
        "metadata": dict(row.details or {}),
        "prev_hash": prev_hash,
        "integrity_hash": row.entry_hash,
    }


def _identity(entry: Mapping[str, Any]) -> tuple[str, str, str]:
    """Deduplication key for a rendered entry: which action, on which thing."""
    return (
        str(entry.get("action") or ""),
        str(entry.get("entity_type") or ""),
        str(entry.get("entity_id") or ""),
    )


def _event_identity(event: AuditEvent) -> tuple[str, str, str]:
    """The same key for an unrendered projection event; normalised identically."""
    return (event.action or "", event.entity_type or "", event.entity_id or "")


@dataclass(frozen=True)
class MergedAuditTrail:
    """The merged view plus the integrity facts that apply to each half."""

    entries: list[dict[str, Any]]
    ledger_count: int
    projected_count: int
    ledger_verification: LedgerVerification
    projection_chain_valid: bool


def merge_trail(
    ledger_rows: Sequence[AuditEventRow],
    events: Iterable[AuditEvent],
    case_names: Mapping[str, str] | None = None,
) -> MergedAuditTrail:
    """Merge append-only ledger rows with read-time projections, newest first.

    Ledger rows win: a projected event whose ``(action, entity_type, entity_id)``
    already appears in the ledger is dropped, so nothing is reported twice. Both
    halves are verified, separately, and the results are kept separate — the
    ledger's chain says something the projection's chain does not.
    """
    ledger_entries = [ledger_entry(row, case_names) for row in ledger_rows]
    covered = {_identity(entry) for entry in ledger_entries}

    # Drop duplicates *before* chaining: the projection chain has to be built
    # over exactly the entries the response returns, or its prev_hash links
    # would refer to entries nobody can see.
    surviving = [event for event in events if _event_identity(event) not in covered]
    projected_entries = build_ledger(surviving, case_names)
    projection_valid = verify_ledger(projected_entries)

    ordered = sorted(
        ledger_entries + projected_entries,
        key=lambda entry: (
            str(entry["timestamp"]),
            int(entry["sequence"] or 0),
            str(entry["log_id"]),
        ),
        reverse=True,
    )
    return MergedAuditTrail(
        entries=ordered,
        ledger_count=len(ledger_entries),
        projected_count=len(projected_entries),
        ledger_verification=verify_ledger_rows(ledger_rows),
        projection_chain_valid=projection_valid,
    )


def _matches_search(entry: Mapping[str, Any], needle: str) -> bool:
    haystack = " ".join(
        str(entry.get(name) or "")
        for name in ("log_id", "action", "actor", "case_id", "case_name", "entity_id", "details")
    )
    metadata = entry.get("metadata")
    if isinstance(metadata, Mapping):
        haystack = f"{haystack} {_canonical(metadata)}"
    haystack = f"{haystack} {entry.get('integrity_hash', '')}"
    return needle in haystack.lower()


def filter_entries(
    entries: Sequence[Mapping[str, Any]],
    *,
    case_id: str | None = None,
    action: str | None = None,
    search: str | None = None,
) -> list[dict[str, Any]]:
    selected = [dict(entry) for entry in entries]
    if case_id:
        selected = [entry for entry in selected if entry.get("case_id") == case_id]
    if action:
        wanted = action.strip().upper()
        selected = [entry for entry in selected if str(entry.get("action", "")).upper() == wanted]
    if search and search.strip():
        needle = search.strip().lower()
        selected = [entry for entry in selected if _matches_search(entry, needle)]
    return selected


def _csv_cell(value: Any) -> Any:
    """Render one ledger field as a CSV cell; structured values become canonical JSON."""
    if isinstance(value, Mapping | list):
        return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)
    return "" if value is None else value


def entries_to_csv(entries: Sequence[Mapping[str, Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CSV_COLUMNS)
    for entry in entries:
        writer.writerow([_csv_cell(entry.get(column)) for column in CSV_COLUMNS])
    return buffer.getvalue()


# --------------------------------------------------------------------------
# Row -> event projections (pure; take ORM instances, touch no session)
# --------------------------------------------------------------------------


def case_event(case: Case) -> AuditEvent:
    return AuditEvent(
        timestamp=case.created_at,
        action="CASE_CREATED",
        actor=f"system:{case.source}",
        entity_type="case",
        entity_id=case.case_id,
        case_id=case.case_id,
        details=f"Case '{case.name}' created ({case.source})",
        metadata=_clean_metadata({"source": case.source, "name": case.name}),
    )


def document_event(document: Document) -> AuditEvent:
    document_type = document.document_type or "unclassified"
    return AuditEvent(
        timestamp=document.created_at,
        action="DOCUMENT_INGESTED",
        actor=SYSTEM_INGESTION_ACTOR,
        entity_type="document",
        entity_id=str(document.id),
        case_id=document.case_id,
        details=(
            f"Document '{document.filename}' ingested as {document_type} "
            f"({document.size_bytes} bytes, status {document.status})"
        ),
        metadata=_clean_metadata(
            {
                "filename": document.filename,
                "document_type": document.document_type,
                "mime_type": document.mime_type,
                "size_bytes": document.size_bytes,
                "page_count": document.page_count,
                "status": document.status,
                "parser_version": document.parser_version,
                "sha256": document.content_sha256,
                "error_message": document.error_message,
            }
        ),
    )


def workflow_events(run: WorkflowRun) -> list[AuditEvent]:
    """A run yields a start event and, once it has finished, a terminal event."""
    result = run.result if isinstance(run.result, dict) else {}
    issues = result.get("issues")
    issue_count = len(issues) if isinstance(issues, list) else None
    failures = result.get("extraction_failures")
    failure_count = len(failures) if isinstance(failures, list) else None
    base_metadata = _clean_metadata(
        {
            "workflow_id": str(run.id),
            "workflow_type": run.workflow_type,
            "route": run.route,
        }
    )
    events = [
        AuditEvent(
            timestamp=run.started_at or run.created_at,
            action="WORKFLOW_STARTED",
            actor=SYSTEM_WORKFLOW_ACTOR,
            entity_type="workflow",
            entity_id=str(run.id),
            case_id=run.case_id,
            details=f"Analysis workflow '{run.workflow_type}' started",
            metadata=base_metadata,
        )
    ]
    if run.status not in {"completed", "failed"} or run.completed_at is None:
        return events

    errors = run.errors if isinstance(run.errors, list) else []
    terminal_metadata = _clean_metadata(
        {
            **base_metadata,
            "status": run.status,
            "duration_ms": run.duration_ms,
            "requires_review": run.requires_review,
            "findings_count": issue_count,
            "extraction_failure_count": failure_count,
            "errors": errors or None,
        }
    )
    if run.status == "completed":
        finding_text = (
            "findings unavailable" if issue_count is None else f"{issue_count} finding(s)"
        )
        details = f"Analysis workflow completed with {finding_text}"
    else:
        reason = "; ".join(str(item) for item in errors) or "no error detail recorded"
        details = f"Analysis workflow failed: {reason}"
    events.append(
        AuditEvent(
            timestamp=run.completed_at,
            action="WORKFLOW_COMPLETED" if run.status == "completed" else "WORKFLOW_FAILED",
            actor=SYSTEM_WORKFLOW_ACTOR,
            entity_type="workflow",
            entity_id=str(run.id),
            case_id=run.case_id,
            details=details,
            metadata=terminal_metadata,
        )
    )
    return events


_DECISION_ACTIONS = {
    "APPROVED": "FINDING_APPROVED",
    "REJECTED": "FINDING_REJECTED",
    "RESOLVED": "FINDING_RESOLVED",
}


def review_events(task: ReviewTask) -> list[AuditEvent]:
    """A review task yields its creation and, once decided, its decision."""
    discrepancy = task.discrepancy if isinstance(task.discrepancy, dict) else {}
    discrepancy_type = str(discrepancy.get("type") or "unclassified")
    base_metadata = _clean_metadata(
        {
            "review_id": str(task.id),
            "discrepancy_type": discrepancy.get("type"),
            "severity": task.severity,
            "workflow_id": str(task.workflow_run_id) if task.workflow_run_id else None,
        }
    )
    events = [
        AuditEvent(
            timestamp=task.created_at,
            action="FINDING_FLAGGED",
            actor=SYSTEM_WORKFLOW_ACTOR,
            entity_type="review_finding",
            entity_id=str(task.id),
            case_id=task.case_id,
            details=(
                f"Discrepancy '{discrepancy_type}' ({task.severity}) flagged for human review"
            ),
            metadata=base_metadata,
        )
    ]
    action = _DECISION_ACTIONS.get(task.status)
    if action is None or task.decided_at is None:
        return events

    verb = task.status.lower()
    events.append(
        AuditEvent(
            timestamp=task.decided_at,
            action=action,
            actor=task.reviewer or UNKNOWN_REVIEWER,
            entity_type="review_finding",
            entity_id=str(task.id),
            case_id=task.case_id,
            details=f"Finding '{discrepancy_type}' {verb} by {task.reviewer or UNKNOWN_REVIEWER}",
            metadata=_clean_metadata({**base_metadata, "status": task.status, "note": task.note}),
        )
    )
    return events


def query_event(run: QueryRun) -> AuditEvent:
    citations = run.citations if isinstance(run.citations, dict) else {}
    verification = run.verification if isinstance(run.verification, dict) else {}
    valid = verification.get("valid")
    verdict = "citations verified" if valid else "citations unverified"
    return AuditEvent(
        timestamp=run.created_at,
        action="QUERY_EXECUTED",
        actor=SYSTEM_QA_ACTOR,
        entity_type="query",
        entity_id=str(run.id),
        case_id=None,
        details=(
            f"Question answered via '{run.route}' route ({len(citations)} citations, {verdict})"
        ),
        metadata=_clean_metadata(
            {
                "query": run.query,
                "route": run.route,
                "routing_method": run.routing_method,
                "retrieval_mode": run.retrieval_mode,
                "citation_count": len(citations),
                "citations_valid": valid,
                "context_chars": run.context_chars,
                "latency_ms": run.latency_ms,
            }
        ),
    )


def attestation_event(attestation: AuditAttestation) -> AuditEvent:
    return AuditEvent(
        timestamp=attestation.created_at,
        action="MANUAL_ATTESTATION",
        actor=attestation.actor,
        entity_type="attestation",
        entity_id=str(attestation.id),
        case_id=attestation.case_id,
        details=attestation.details,
        metadata=_clean_metadata(dict(attestation.attestation_metadata or {})),
    )


# --------------------------------------------------------------------------
# Write path: the same vocabulary, appended to the real ledger
# --------------------------------------------------------------------------


async def append_projection_event(session: AsyncSession, event: AuditEvent) -> AuditEventRow:
    """Append a projection-shaped event to the append-only ledger.

    Call sites build the event with the very same projection function the read
    path uses (:func:`case_event`, :func:`document_event`, :func:`review_events`,
    :func:`workflow_events`), so the ledger and the projection share one
    vocabulary and one metadata shape. That is also what makes the
    ``(action, entity_type, entity_id)`` deduplication in :func:`merge_trail`
    exact.

    The row is flushed, not committed; the caller commits it with its own work.
    """
    return await append_event(
        session,
        event_type=event.action,
        actor=event.actor,
        summary=event.details,
        case_id=event.case_id,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        details=event.metadata,
    )


# --------------------------------------------------------------------------
# Database-backed assembly
# --------------------------------------------------------------------------


class AuditService:
    """Reads the source tables and assembles the hash-chained ledger."""

    def __init__(self, session: AsyncSession, *, max_rows: int = MAX_SOURCE_ROWS) -> None:
        self._session = session
        self._max_rows = max_rows

    async def _case_names(self) -> dict[str, str]:
        rows = await self._session.execute(select(Case.case_id, Case.name))
        return {row.case_id: row.name for row in rows}

    async def collect_events(self) -> list[AuditEvent]:
        events: list[AuditEvent] = []

        cases = (
            (await self._session.execute(select(Case).order_by(Case.created_at.desc())))
            .scalars()
            .all()
        )
        events.extend(case_event(case) for case in cases)

        documents = (
            (
                await self._session.execute(
                    select(Document).order_by(Document.created_at.desc()).limit(self._max_rows)
                )
            )
            .scalars()
            .all()
        )
        events.extend(document_event(document) for document in documents)

        runs = (
            (
                await self._session.execute(
                    select(WorkflowRun)
                    .order_by(WorkflowRun.created_at.desc())
                    .limit(self._max_rows)
                )
            )
            .scalars()
            .all()
        )
        for run in runs:
            events.extend(workflow_events(run))

        tasks = (
            (
                await self._session.execute(
                    select(ReviewTask).order_by(ReviewTask.created_at.desc()).limit(self._max_rows)
                )
            )
            .scalars()
            .all()
        )
        for task in tasks:
            events.extend(review_events(task))

        queries = (
            (
                await self._session.execute(
                    select(QueryRun).order_by(QueryRun.created_at.desc()).limit(self._max_rows)
                )
            )
            .scalars()
            .all()
        )
        events.extend(query_event(run) for run in queries)

        attestations = (
            (
                await self._session.execute(
                    select(AuditAttestation)
                    .order_by(AuditAttestation.created_at.desc())
                    .limit(self._max_rows)
                )
            )
            .scalars()
            .all()
        )
        events.extend(attestation_event(attestation) for attestation in attestations)

        return events

    async def ledger(self) -> list[dict[str, Any]]:
        """Projection-only view. Kept for callers that want just the derived events."""
        events = await self.collect_events()
        return build_ledger(events, await self._case_names())

    async def merged_trail(self) -> MergedAuditTrail:
        """The full audit trail: append-only ledger rows plus deduplicated projections."""
        ledger_rows = await read_ledger(self._session)
        events = await self.collect_events()
        return merge_trail(ledger_rows, events, await self._case_names())

    async def record_attestation(
        self,
        *,
        actor: str,
        details: str,
        case_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AuditAttestation:
        attestation = AuditAttestation(
            case_id=case_id or None,
            actor=actor.strip(),
            details=details.strip(),
            attestation_metadata=metadata or {},
        )
        self._session.add(attestation)
        await self._session.commit()
        await self._session.refresh(attestation)
        return attestation
