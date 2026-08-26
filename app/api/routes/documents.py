"""Document ingestion and retrieval endpoints."""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models import Chunk, Document, ExtractionRun
from app.services.documents import DocumentService

router = APIRouter(prefix="/documents", tags=["documents"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
DocumentTypeParam = Literal["invoice", "contract", "purchase_order", "policy", "other"]
StatusParam = Literal["pending", "parsed", "failed"]


class DocumentUploadResponse(BaseModel):
    document_id: uuid.UUID
    filename: str
    sha256: str
    mime_type: str
    size_bytes: int
    status: str
    duplicate: bool
    chunk_count: int
    page_count: int | None


class DocumentSummary(BaseModel):
    document_id: uuid.UUID
    filename: str
    sha256: str
    mime_type: str
    size_bytes: int
    status: str
    document_type: str | None
    case_id: str | None
    page_count: int | None
    parser_version: str
    created_at: datetime


class DocumentDetail(DocumentSummary):
    error_message: str | None
    doc_metadata: dict[str, Any]
    element_count: int
    chunk_count: int


class ExtractionResponse(BaseModel):
    """Stored structured fields for a document, or an honest 'not extracted yet'."""

    document_id: uuid.UUID
    filename: str
    document_type: str | None
    extracted: bool
    fields: dict[str, Any] = {}
    method: str | None = None
    prompt_name: str | None = None
    prompt_version: str | None = None
    extracted_at: datetime | None = None


class ChunkResponse(BaseModel):
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    text: str
    page_number: int | None
    section: str | None
    element_type: str
    order_index: int
    token_estimate: int
    chunk_metadata: dict[str, Any]


def _summary(document: Document) -> DocumentSummary:
    return DocumentSummary(
        document_id=document.id,
        filename=document.filename,
        sha256=document.content_sha256,
        mime_type=document.mime_type,
        size_bytes=document.size_bytes,
        status=document.status,
        document_type=document.document_type,
        case_id=document.case_id,
        page_count=document.page_count,
        parser_version=document.parser_version,
        created_at=document.created_at,
    )


def _chunk_response(chunk: Chunk) -> ChunkResponse:
    return ChunkResponse(
        chunk_id=chunk.id,
        document_id=chunk.document_id,
        text=chunk.text,
        page_number=chunk.page_number,
        section=chunk.section,
        element_type=chunk.element_type,
        order_index=chunk.order_index,
        token_estimate=chunk.token_estimate,
        chunk_metadata=chunk.chunk_metadata,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    session: SessionDep,
    file: Annotated[UploadFile, File(description="Document file to ingest")],
    document_type: Annotated[DocumentTypeParam | None, Form()] = None,
    case_id: Annotated[str | None, Form(max_length=128)] = None,
) -> DocumentUploadResponse:
    data = await file.read()
    outcome = await DocumentService(session).upload(
        data=data,
        filename=file.filename,
        document_type=document_type,
        case_id=case_id,
    )
    document = outcome.document
    return DocumentUploadResponse(
        document_id=document.id,
        filename=document.filename,
        sha256=document.content_sha256,
        mime_type=document.mime_type,
        size_bytes=document.size_bytes,
        status=document.status,
        duplicate=outcome.duplicate,
        chunk_count=outcome.chunk_count,
        page_count=document.page_count,
    )


@router.get("")
async def list_documents(
    session: SessionDep,
    document_type: Annotated[DocumentTypeParam | None, Query()] = None,
    case_id: Annotated[str | None, Query(max_length=128)] = None,
    status_filter: Annotated[StatusParam | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[DocumentSummary]:
    documents = await DocumentService(session).list_documents(
        document_type=document_type,
        case_id=case_id,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return [_summary(document) for document in documents]


@router.get("/{document_id}")
async def get_document(document_id: uuid.UUID, session: SessionDep) -> DocumentDetail:
    document, element_count, chunk_count = await DocumentService(session).get_document(document_id)
    return DocumentDetail(
        **_summary(document).model_dump(),
        error_message=document.error_message,
        doc_metadata=document.doc_metadata,
        element_count=element_count,
        chunk_count=chunk_count,
    )


@router.get("/{document_id}/chunks")
async def get_document_chunks(document_id: uuid.UUID, session: SessionDep) -> list[ChunkResponse]:
    chunks = await DocumentService(session).get_chunks(document_id)
    return [_chunk_response(chunk) for chunk in chunks]


@router.get("/{document_id}/extraction")
async def get_document_extraction(
    document_id: uuid.UUID, session: SessionDep
) -> ExtractionResponse:
    """Return the stored structured fields for one document.

    Serves the most recent schema-valid extraction run. This never invokes the
    model: a document that has not been extracted yet reports
    ``extracted: false`` rather than triggering work behind a GET.
    """
    document, _element_count, _chunk_count = await DocumentService(session).get_document(
        document_id
    )
    result = await session.execute(
        select(ExtractionRun)
        .where(
            ExtractionRun.document_id == document_id,
            ExtractionRun.schema_valid.is_(True),
        )
        .order_by(ExtractionRun.created_at.desc())
        .limit(1)
    )
    run = result.scalar_one_or_none()
    if run is None:
        return ExtractionResponse(
            document_id=document_id,
            filename=document.filename,
            document_type=document.document_type,
            extracted=False,
        )
    return ExtractionResponse(
        document_id=document_id,
        filename=document.filename,
        document_type=run.document_type,
        extracted=True,
        fields=dict(run.data),
        method=run.method,
        prompt_name=run.prompt_name,
        prompt_version=run.prompt_version,
        extracted_at=run.created_at,
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: uuid.UUID, session: SessionDep) -> None:
    await DocumentService(session).delete_document(document_id)
