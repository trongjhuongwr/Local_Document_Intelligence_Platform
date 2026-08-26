"""Write-time append-only audit ledger.

This is the half of the audit trail that can actually defend the word
"tamper-evident". Every function that hashes is pure and importable without a
database; the only database-touching functions are :func:`append_event` and
:func:`read_ledger`.

The chain
---------
``entry_hash = sha256(prev_hash || canonical_json(payload))`` where ``payload``
is a deterministic serialisation of the row's own fields (fixed key set, sorted
keys everywhere including nested objects, timestamps normalised to UTC ISO-8601).
The first row chains from :data:`GENESIS_HASH`. Because each hash folds in the
previous one, altering any stored field of any row breaks that row and every row
after it, and :func:`verify_ledger` reports the first sequence where that
happens.

``sequence`` is not part of the hashed payload: it is assigned by the database at
insert time, so it is not known when the hash is computed. Order-dependence comes
from ``prev_hash`` instead, which is the property that actually matters.

Concurrency
-----------
:func:`append_event` takes ``pg_advisory_xact_lock`` on a fixed key before it
reads the tail and before it inserts. Two concurrent appends therefore serialise:
the second waits until the first commits (or rolls back), so it always reads the
real tail and cannot fork the chain. A transaction-scoped advisory lock was
chosen over ``SELECT ... FOR UPDATE`` on the tail row because the tail row must
never be locked *for update* — the append-only trigger rejects updates — and over
``LOCK TABLE`` because the advisory lock does not block unrelated readers.

Limits of this design are documented on :class:`app.models.audit.AuditEvent`.
Read them before describing this ledger to anyone.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditEvent

GENESIS_HASH = "0" * 64
"""``prev_hash`` written for the first row in the chain."""

CHAIN_ALGORITHM = "sha256"

LEDGER_LOCK_KEY: int = int.from_bytes(
    hashlib.sha256(b"docintel.audit_events").digest()[:8], "big", signed=True
)
"""Advisory-lock key for the ledger, derived from the table name so it cannot
collide by accident with an unrelated advisory lock in the same database."""

PAYLOAD_FIELDS: tuple[str, ...] = (
    "occurred_at",
    "event_type",
    "actor",
    "case_id",
    "entity_type",
    "entity_id",
    "summary",
    "details",
)
"""Exactly the fields covered by ``entry_hash``. ``id`` and ``sequence`` are
database-assigned and excluded; ``prev_hash`` is the hash prefix, not payload."""


# --------------------------------------------------------------------------
# Pure hashing / verification (no database, unit-testable on their own)
# --------------------------------------------------------------------------


def canonical_json(payload: Mapping[str, Any]) -> str:
    """Serialise a payload so the same content always yields the same bytes.

    Keys are sorted at every level, separators are fixed, and non-JSON values
    fall back to ``str`` so hashing can never raise. Callers should pass plain
    JSON values: anything that survives a JSONB round-trip unchanged.
    """
    return json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str
    )


def _as_utc_iso(value: datetime) -> str:
    aware = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return aware.astimezone(UTC).isoformat()


def event_payload(
    *,
    occurred_at: datetime,
    event_type: str,
    actor: str,
    summary: str,
    case_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    details: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the hashed payload for one event, independent of any ORM instance."""
    return {
        "occurred_at": _as_utc_iso(occurred_at),
        "event_type": event_type,
        "actor": actor,
        "case_id": case_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "summary": summary,
        "details": dict(details or {}),
    }


def row_payload(event: AuditEvent) -> dict[str, Any]:
    """Rebuild the hashed payload from a stored row, for re-verification."""
    return event_payload(
        occurred_at=event.occurred_at,
        event_type=event.event_type,
        actor=event.actor,
        summary=event.summary,
        case_id=event.case_id,
        entity_type=event.entity_type,
        entity_id=event.entity_id,
        details=event.details or {},
    )


def compute_entry_hash(prev_hash: str | None, payload: Mapping[str, Any]) -> str:
    """``sha256(prev_hash || canonical_json(payload))``; ``None`` means genesis."""
    prefix = prev_hash if prev_hash is not None else GENESIS_HASH
    return hashlib.sha256(f"{prefix}{canonical_json(payload)}".encode()).hexdigest()


@dataclass(frozen=True)
class LedgerVerification:
    """Outcome of recomputing the chain over stored ledger rows."""

    valid: bool
    checked: int
    first_broken_sequence: int | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "valid": self.valid,
            "checked": self.checked,
            "first_broken_sequence": self.first_broken_sequence,
        }


def verify_ledger(events: Sequence[AuditEvent]) -> LedgerVerification:
    """Recompute the chain from stored rows.

    ``events`` must be the **complete** ledger: the lowest-sequence row is
    required to chain from :data:`GENESIS_HASH`, which is what makes removal of
    the oldest rows detectable. Ordering of the argument does not matter; rows
    are sorted by ``sequence`` first.

    ``first_broken_sequence`` is the ``sequence`` of the earliest row whose
    stored ``prev_hash`` or ``entry_hash`` disagrees with the recomputation.
    """
    ordered = sorted(events, key=lambda event: event.sequence)
    prev_hash = GENESIS_HASH
    checked = 0
    for event in ordered:
        checked += 1
        stored_prev = event.prev_hash if event.prev_hash is not None else GENESIS_HASH
        if stored_prev != prev_hash:
            return LedgerVerification(False, checked, event.sequence)
        expected = compute_entry_hash(prev_hash, row_payload(event))
        if event.entry_hash != expected:
            return LedgerVerification(False, checked, event.sequence)
        prev_hash = expected
    return LedgerVerification(True, checked, None)


# --------------------------------------------------------------------------
# Database-backed append / read
# --------------------------------------------------------------------------

_ADVISORY_LOCK = text("SELECT pg_advisory_xact_lock(:key)")


async def append_event(
    session: AsyncSession,
    *,
    event_type: str,
    actor: str,
    summary: str,
    case_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    details: Mapping[str, Any] | None = None,
) -> AuditEvent:
    """Append one row to the ledger, linked to the current tail.

    The row is flushed but **not** committed: the caller commits it together
    with whatever action it describes, so an action and its ledger row either
    both land or neither does. The advisory lock is held until that commit.

    ``occurred_at`` is stamped in Python rather than by the column default,
    because the hash has to be computed before the ``INSERT``.
    """
    await session.execute(_ADVISORY_LOCK, {"key": LEDGER_LOCK_KEY})

    tail = (
        await session.execute(select(AuditEvent).order_by(AuditEvent.sequence.desc()).limit(1))
    ).scalar_one_or_none()
    prev_hash = tail.entry_hash if tail is not None else GENESIS_HASH

    payload = event_payload(
        occurred_at=datetime.now(UTC),
        event_type=event_type,
        actor=actor,
        summary=summary,
        case_id=case_id,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
    )
    event = AuditEvent(
        occurred_at=datetime.fromisoformat(payload["occurred_at"]),
        event_type=event_type,
        actor=actor,
        case_id=case_id,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        details=payload["details"],
        prev_hash=prev_hash,
        entry_hash=compute_entry_hash(prev_hash, payload),
    )
    session.add(event)
    await session.flush()
    # ``sequence`` is BIGSERIAL, so it only exists after the INSERT.
    await session.refresh(event, ["sequence"])
    return event


async def read_ledger(session: AsyncSession) -> list[AuditEvent]:
    """Return every ledger row, oldest first.

    Deliberately unbounded: :func:`verify_ledger` can only detect removal of the
    oldest rows if it is handed the complete chain, and a partial read would
    make the endpoint's integrity claim weaker than it says it is. This is O(n)
    per request; see the limitations reported by ``GET /api/audit-trail``.
    """
    result = await session.execute(select(AuditEvent).order_by(AuditEvent.sequence))
    return list(result.scalars().all())
