"""ORM models for the audit trail: recorded attestations and the append-only ledger.

Two different things live here, and they carry different guarantees:

``AuditAttestation``
    A sign-off a human types in. It is an ordinary mutable row.

``AuditEvent``
    A row in the append-only ledger written at the moment an action happens.
    ``app/services/audit.py`` additionally *projects* events from the live
    business tables at read time; those projections are reconstructions and are
    labelled ``source="projected"`` in the API. Only ``audit_events`` rows are
    append-only.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CHAR, BigInteger, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

AUDIT_EVENT_SEQUENCE = "audit_events_sequence_seq"
"""Name of the BIGSERIAL sequence backing :attr:`AuditEvent.sequence`."""


class AuditAttestation(Base):
    """A sign-off statement recorded against a case (or the workspace as a whole)."""

    __tablename__ = "audit_attestations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[str | None] = mapped_column(
        String(128), ForeignKey("cases.case_id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor: Mapped[str] = mapped_column(String(256), nullable=False)
    details: Mapped[str] = mapped_column(Text, nullable=False)
    attestation_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=sql_text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AuditEvent(Base):
    """One immutable entry in the write-time, hash-chained audit ledger.

    Rows are appended by :func:`app.services.audit_ledger.append_event` inside the
    same transaction as the action they describe (the one exception is document
    ingestion, where the repository commits the document first — see that call
    site). ``entry_hash`` is ``sha256(prev_hash || canonical_json(payload))``, so
    editing any stored field of any row invalidates that row and every row after
    it.

    What the append-only guarantee actually is
    ------------------------------------------
    The migration installs a ``BEFORE UPDATE OR DELETE ... FOR EACH ROW`` trigger
    that raises an exception, so ordinary ``UPDATE`` and ``DELETE`` statements
    issued through the application's database role fail.

    What it does **not** cover:

    * A superuser (or the table's owner) can ``DROP TRIGGER`` / ``ALTER TABLE
      ... DISABLE TRIGGER`` and then edit or delete rows freely. This project's
      application role owns the table, so this is a real gap, not a theoretical
      one.
    * ``TRUNCATE`` fires a ``TRUNCATE`` trigger event, not ``DELETE``, and no
      ``TRUNCATE`` guard is installed (the integration tests need to clean up).
      A truncate therefore erases the ledger without error. Detecting that from
      the outside requires an external copy of the last known ``entry_hash``;
      the platform does not keep one.
    * ``DROP TABLE`` and restoring an older physical backup are likewise
      unconstrained.
    * The chain proves *internal* consistency only. Nothing is anchored to an
      external notary or a second machine, so an attacker with write access to
      the whole table can rewrite every row and recompute every hash.
    * The ledger records what the application chose to record. An action that
      never calls ``append_event`` leaves no ledger row at all.

    ``case_id`` is deliberately **not** a foreign key: deleting a case must not
    cascade into (or ``SET NULL`` on) the ledger, and either would be blocked by
    the trigger anyway. Ledger rows outlive the entities they describe.
    """

    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_case_id", "case_id"),
        Index("ix_audit_events_occurred_at", "occurred_at"),
        Index("ix_audit_events_event_type", "event_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sequence: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        unique=True,
        server_default=sql_text(f"nextval('{AUDIT_EVENT_SEQUENCE}')"),
    )
    """Chain order. Monotonic but not necessarily gap-free: a rolled-back append
    consumes a sequence value. Verification follows ``prev_hash``, never
    contiguity."""

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    actor: Mapped[str] = mapped_column(String(256), nullable=False)
    case_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=sql_text("'{}'::jsonb")
    )
    prev_hash: Mapped[str | None] = mapped_column(CHAR(64), nullable=True)
    """``entry_hash`` of the previous row. The application always writes the
    explicit genesis constant for the first row rather than ``NULL``, so every
    row's hash input is unambiguous; the column stays nullable so a ``NULL``
    written by anything else is representable rather than a load error."""

    entry_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
