"""ORM model for manually recorded auditor attestations.

Every other audit-trail event is projected from a table the platform already
writes. An attestation is the one event a human enters directly, so it needs a
row of its own; nothing about it is derived or generated.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


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
