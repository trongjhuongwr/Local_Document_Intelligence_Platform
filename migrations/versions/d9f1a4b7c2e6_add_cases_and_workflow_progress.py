"""add cases and workflow progress

Revision ID: d9f1a4b7c2e6
Revises: b6f4c2d8e1a9
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d9f1a4b7c2e6"
down_revision: str | None = "b6f4c2d8e1a9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cases",
        sa.Column("case_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("case_id"),
    )
    op.execute(
        """
        INSERT INTO cases (case_id, name, source)
        SELECT case_id, case_id, 'legacy' FROM (
            SELECT DISTINCT case_id FROM documents WHERE case_id IS NOT NULL
            UNION SELECT DISTINCT case_id FROM review_tasks WHERE case_id IS NOT NULL
            UNION SELECT DISTINCT input_payload->>'case_id' AS case_id FROM workflow_runs
                  WHERE input_payload->>'case_id' IS NOT NULL
        ) existing_cases
        ON CONFLICT (case_id) DO NOTHING
        """
    )
    op.add_column("workflow_runs", sa.Column("case_id", sa.String(length=128), nullable=True))
    op.add_column(
        "workflow_runs", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "workflow_runs", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute("UPDATE workflow_runs SET case_id = input_payload->>'case_id' WHERE case_id IS NULL")
    op.create_index("ix_workflow_runs_case_id", "workflow_runs", ["case_id"])
    op.create_index(
        "uq_workflow_runs_active_case",
        "workflow_runs",
        ["case_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('queued', 'running') AND case_id IS NOT NULL"),
    )
    op.create_foreign_key(
        "fk_workflow_runs_case_id_cases",
        "workflow_runs",
        "cases",
        ["case_id"],
        ["case_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_documents_case_id_cases",
        "documents",
        "cases",
        ["case_id"],
        ["case_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_review_tasks_case_id_cases",
        "review_tasks",
        "cases",
        ["case_id"],
        ["case_id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_review_tasks_case_id_cases", "review_tasks", type_="foreignkey")
    op.drop_constraint("fk_documents_case_id_cases", "documents", type_="foreignkey")
    op.drop_constraint("fk_workflow_runs_case_id_cases", "workflow_runs", type_="foreignkey")
    op.drop_index("uq_workflow_runs_active_case", table_name="workflow_runs")
    op.drop_index("ix_workflow_runs_case_id", table_name="workflow_runs")
    op.drop_column("workflow_runs", "completed_at")
    op.drop_column("workflow_runs", "started_at")
    op.drop_column("workflow_runs", "case_id")
    op.drop_table("cases")
