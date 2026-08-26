"""create extraction_runs, query_runs, workflow_runs, and review_tasks tables

Revision ID: a7d2e4f6c8b0
Revises: f3a1c9d0b2e4
Create Date: 2026-08-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7d2e4f6c8b0"
down_revision: str | None = "f3a1c9d0b2e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_JSONB_EMPTY_OBJECT = sa.text("'{}'::jsonb")
_JSONB_EMPTY_ARRAY = sa.text("'[]'::jsonb")


def upgrade() -> None:
    op.create_table(
        "extraction_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("document_type", sa.String(length=32), nullable=False),
        sa.Column(
            "data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_JSONB_EMPTY_OBJECT,
        ),
        sa.Column("method", sa.String(length=64), nullable=False),
        sa.Column("prompt_name", sa.String(length=64), nullable=False),
        sa.Column("prompt_version", sa.String(length=16), nullable=False),
        sa.Column("schema_valid", sa.Boolean(), nullable=False),
        sa.Column(
            "telemetry",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_JSONB_EMPTY_OBJECT,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_extraction_runs_document_id", "extraction_runs", ["document_id"])

    op.create_table(
        "query_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("route", sa.String(length=32), nullable=False),
        sa.Column("routing_method", sa.String(length=16), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column(
            "citations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_JSONB_EMPTY_OBJECT,
        ),
        sa.Column(
            "verification",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_JSONB_EMPTY_OBJECT,
        ),
        sa.Column("retrieval_mode", sa.String(length=16), nullable=True),
        sa.Column("context_chars", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "workflow_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("workflow_type", sa.String(length=32), nullable=False),
        sa.Column(
            "status", sa.String(length=16), nullable=False, server_default=sa.text("'running'")
        ),
        sa.Column("route", sa.String(length=32), nullable=True),
        sa.Column(
            "input_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_JSONB_EMPTY_OBJECT,
        ),
        sa.Column(
            "result",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_JSONB_EMPTY_OBJECT,
        ),
        sa.Column(
            "steps",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_JSONB_EMPTY_ARRAY,
        ),
        sa.Column(
            "errors",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_JSONB_EMPTY_ARRAY,
        ),
        sa.Column("requires_review", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("duration_ms", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "review_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "workflow_run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workflow_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("case_id", sa.String(length=128), nullable=True),
        sa.Column(
            "discrepancy",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=_JSONB_EMPTY_OBJECT,
        ),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'OPEN'")),
        sa.Column("reviewer", sa.String(length=128), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_review_tasks_workflow_run_id", "review_tasks", ["workflow_run_id"])
    op.create_index("ix_review_tasks_case_id", "review_tasks", ["case_id"])


def downgrade() -> None:
    op.drop_index("ix_review_tasks_case_id", table_name="review_tasks")
    op.drop_index("ix_review_tasks_workflow_run_id", table_name="review_tasks")
    op.drop_table("review_tasks")
    op.drop_table("workflow_runs")
    op.drop_table("query_runs")
    op.drop_index("ix_extraction_runs_document_id", table_name="extraction_runs")
    op.drop_table("extraction_runs")
