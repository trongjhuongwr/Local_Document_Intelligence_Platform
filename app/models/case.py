"""Persisted business cases that own documents, workflows, and review findings."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.workflow import ReviewTask, WorkflowRun


class Case(Base):
    __tablename__ = "cases"

    case_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    documents: Mapped[list[Document]] = relationship(
        back_populates="case", cascade="all, delete-orphan", passive_deletes=True
    )
    workflows: Mapped[list[WorkflowRun]] = relationship(
        back_populates="case", cascade="all, delete-orphan", passive_deletes=True
    )
    reviews: Mapped[list[ReviewTask]] = relationship(
        back_populates="case", cascade="all, delete-orphan", passive_deletes=True
    )
