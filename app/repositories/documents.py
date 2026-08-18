"""Async repository for documents, their elements, and chunks."""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingestion.types import ChunkDraft, ParsedElement
from app.models import Case, Chunk, Document, DocumentElement


class DocumentRepository:
    """CRUD operations for the documents/document_elements/chunks tables."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ensure_case(self, case_id: str) -> None:
        """Preserve legacy /documents behavior while satisfying the Case foreign key."""
        if await self._session.get(Case, case_id) is None:
            self._session.add(Case(case_id=case_id, name=case_id, source="legacy"))
            await self._session.commit()

    async def create(
        self,
        *,
        filename: str,
        content_sha256: str,
        dedup_key: str | None = None,
        mime_type: str,
        size_bytes: int,
        page_count: int | None,
        document_type: str | None,
        case_id: str | None,
        status: str,
        parser_version: str,
        document_id: uuid.UUID | None = None,
        error_message: str | None = None,
        doc_metadata: dict[str, Any] | None = None,
        elements: Sequence[ParsedElement] = (),
        chunks: Sequence[ChunkDraft] = (),
    ) -> Document:
        """Insert a document together with its elements and chunks in one transaction."""
        if case_id is not None:
            await self.ensure_case(case_id)
            case = await self._session.get(Case, case_id)
            if case is not None:
                case.updated_at = datetime.now(UTC)
        document = Document(
            id=document_id or uuid.uuid4(),
            filename=filename,
            content_sha256=content_sha256,
            dedup_key=dedup_key or content_sha256,
            mime_type=mime_type,
            size_bytes=size_bytes,
            page_count=page_count,
            document_type=document_type,
            case_id=case_id,
            status=status,
            parser_version=parser_version,
            error_message=error_message,
            doc_metadata=doc_metadata or {},
        )
        for order_index, element in enumerate(elements):
            document.elements.append(
                DocumentElement(
                    page_number=element.page_number,
                    element_type=element.element_type,
                    text=element.text,
                    order_index=order_index,
                    element_metadata=element.metadata,
                )
            )
        for draft in chunks:
            document.chunks.append(
                Chunk(
                    text=draft.text,
                    page_number=draft.page_number,
                    section=draft.section,
                    element_type=draft.element_type,
                    order_index=draft.order_index,
                    token_estimate=draft.token_estimate,
                    chunk_metadata=draft.metadata,
                )
            )
        self._session.add(document)
        await self._session.commit()
        await self._session.refresh(document)
        return document

    async def get(self, document_id: uuid.UUID) -> Document | None:
        return await self._session.get(Document, document_id)

    async def get_duplicate(
        self,
        *,
        dedup_key: str,
        content_sha256: str,
        case_id: str | None,
        document_type: str | None,
    ) -> Document | None:
        """Find a scoped duplicate and lazily upgrade legacy dedup keys."""
        result = await self._session.execute(
            select(Document).where(Document.dedup_key == dedup_key)
        )
        document = result.scalar_one_or_none()
        if document is not None:
            return document

        legacy = select(Document).where(Document.content_sha256 == content_sha256)
        legacy = legacy.where(
            Document.case_id.is_(None) if case_id is None else Document.case_id == case_id
        )
        legacy = legacy.where(
            Document.document_type.is_(None)
            if document_type is None
            else Document.document_type == document_type
        )
        result = await self._session.execute(legacy.limit(1))
        document = result.scalar_one_or_none()
        if document is not None and document.dedup_key != dedup_key:
            document.dedup_key = dedup_key
            await self._session.commit()
            await self._session.refresh(document)
        return document

    async def list_documents(
        self,
        *,
        document_type: str | None = None,
        case_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Document]:
        statement = select(Document).order_by(Document.created_at.desc(), Document.id)
        if document_type is not None:
            statement = statement.where(Document.document_type == document_type)
        if case_id is not None:
            statement = statement.where(Document.case_id == case_id)
        if status is not None:
            statement = statement.where(Document.status == status)
        statement = statement.limit(limit).offset(offset)
        result = await self._session.execute(statement)
        return list(result.scalars().all())

    async def count_elements(self, document_id: uuid.UUID) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(DocumentElement)
            .where(DocumentElement.document_id == document_id)
        )
        return int(result.scalar_one())

    async def count_chunks(self, document_id: uuid.UUID) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(Chunk).where(Chunk.document_id == document_id)
        )
        return int(result.scalar_one())

    async def get_chunks(self, document_id: uuid.UUID) -> list[Chunk]:
        result = await self._session.execute(
            select(Chunk).where(Chunk.document_id == document_id).order_by(Chunk.order_index)
        )
        return list(result.scalars().all())

    async def delete(self, document_id: uuid.UUID) -> bool:
        """Delete a document (children cascade at the database level)."""
        document = await self.get(document_id)
        if document is None:
            return False
        await self._session.delete(document)
        await self._session.commit()
        return True
