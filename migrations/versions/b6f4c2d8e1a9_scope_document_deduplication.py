"""scope document deduplication by case and document type

Revision ID: b6f4c2d8e1a9
Revises: c4e8b2d6f1a3
Create Date: 2026-08-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b6f4c2d8e1a9"
down_revision: str | None = "c4e8b2d6f1a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("dedup_key", sa.String(length=64), nullable=True))
    # Existing rows were globally unique by content hash, so the old hash is a
    # safe initial key. New writes use hash(content + case_id + document_type).
    op.execute("UPDATE documents SET dedup_key = content_sha256")
    op.alter_column("documents", "dedup_key", nullable=False)

    op.drop_index("ix_documents_content_sha256", table_name="documents")
    op.create_index("ix_documents_content_sha256", "documents", ["content_sha256"])
    op.create_index("ix_documents_dedup_key", "documents", ["dedup_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_documents_dedup_key", table_name="documents")
    op.drop_index("ix_documents_content_sha256", table_name="documents")
    op.create_index(
        "ix_documents_content_sha256",
        "documents",
        ["content_sha256"],
        unique=True,
    )
    op.drop_column("documents", "dedup_key")
