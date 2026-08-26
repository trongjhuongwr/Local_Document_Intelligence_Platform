"""create audit attestations table

Revision ID: e5c1b7a94d20
Revises: d9f1a4b7c2e6
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e5c1b7a94d20"
down_revision: str | None = "d9f1a4b7c2e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_attestations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", sa.String(length=128), nullable=True),
        sa.Column("actor", sa.String(length=256), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column(
            "attestation_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["cases.case_id"],
            name="fk_audit_attestations_case_id_cases",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_attestations_case_id", "audit_attestations", ["case_id"])
    op.create_index("ix_audit_attestations_created_at", "audit_attestations", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_attestations_created_at", table_name="audit_attestations")
    op.drop_index("ix_audit_attestations_case_id", table_name="audit_attestations")
    op.drop_table("audit_attestations")
