"""create append-only audit_events ledger

Creates the write-time audit ledger and the trigger that makes "append-only" a
statement the database enforces rather than a convention the application hopes
to follow.

What the trigger guarantees
---------------------------
``audit_events_no_update`` fires ``BEFORE UPDATE OR DELETE ... FOR EACH ROW`` and
raises, so ``UPDATE`` and ``DELETE`` statements against this table fail for every
role that is not able to disable it.

What it does NOT guarantee — do not describe this table as immutable:

* A superuser, or the table's owner (this project's application role owns it),
  can ``DROP TRIGGER`` / ``ALTER TABLE ... DISABLE TRIGGER`` and then update or
  delete rows freely.
* ``TRUNCATE`` raises a ``TRUNCATE`` trigger event, not ``DELETE``, and no
  ``TRUNCATE`` guard is installed here on purpose: the integration tests need to
  reset the table. ``TRUNCATE audit_events`` therefore succeeds silently.
* ``DROP TABLE``, and restoring an older physical backup, are unconstrained.
* The hash chain is self-contained. It is not anchored to any external notary,
  so someone who can rewrite the whole table can also recompute every hash and
  leave a chain that verifies.

``case_id`` is intentionally not a foreign key. ``ON DELETE CASCADE`` would need
a ``DELETE`` and ``ON DELETE SET NULL`` would need an ``UPDATE``; the trigger
rejects both, and the ledger is supposed to outlive the rows it describes.

Revision ID: f0b7c3d9a51e
Revises: e5c1b7a94d20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f0b7c3d9a51e"
down_revision: str | None = "e5c1b7a94d20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SEQUENCE = "audit_events_sequence_seq"

_APPEND_ONLY_FUNCTION = """
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (attempted %)', TG_OP
    USING ERRCODE = 'restrict_violation';
END; $$ LANGUAGE plpgsql;
"""

_APPEND_ONLY_TRIGGER = """
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
"""


def upgrade() -> None:
    op.execute(f"CREATE SEQUENCE {_SEQUENCE} AS bigint")
    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "sequence",
            sa.BigInteger(),
            server_default=sa.text(f"nextval('{_SEQUENCE}')"),
            nullable=False,
        ),
        sa.Column(
            "occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("actor", sa.String(length=256), nullable=False),
        sa.Column("case_id", sa.String(length=128), nullable=True),
        sa.Column("entity_type", sa.String(length=64), nullable=True),
        sa.Column("entity_id", sa.String(length=128), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("prev_hash", sa.CHAR(length=64), nullable=True),
        sa.Column("entry_hash", sa.CHAR(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sequence", name="uq_audit_events_sequence"),
    )
    op.execute(f"ALTER SEQUENCE {_SEQUENCE} OWNED BY audit_events.sequence")
    op.create_index("ix_audit_events_case_id", "audit_events", ["case_id"])
    op.create_index("ix_audit_events_occurred_at", "audit_events", ["occurred_at"])
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"])

    op.execute(_APPEND_ONLY_FUNCTION)
    op.execute(_APPEND_ONLY_TRIGGER)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events")
    op.execute("DROP FUNCTION IF EXISTS audit_events_append_only()")
    op.drop_index("ix_audit_events_event_type", table_name="audit_events")
    op.drop_index("ix_audit_events_occurred_at", table_name="audit_events")
    op.drop_index("ix_audit_events_case_id", table_name="audit_events")
    op.drop_table("audit_events")
    op.execute(f"DROP SEQUENCE IF EXISTS {_SEQUENCE}")
