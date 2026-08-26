"""Document service: upload orchestration, retrieval, and deletion.

Uploaded bytes are stored under ``data/uploads/{document_id}{ext}`` where both
the UUID and the extension are server-generated; the client-supplied filename
is kept only as metadata and never used to build filesystem paths.
"""

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import DocumentNotFoundError, DocumentParseError, FileTooLargeError
from app.core.logging import get_logger
from app.ingestion.parsers.registry import EXTENSION_BY_MIME, sniff_mime_type
from app.ingestion.pipeline import PARSER_VERSION, run_pipeline
from app.models import Chunk, Document
from app.repositories.documents import DocumentRepository

logger = get_logger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = _PROJECT_ROOT / "data" / "uploads"


@dataclass(slots=True)
class UploadOutcome:
    """Result of an upload request, including duplicate detection."""

    document: Document
    duplicate: bool
    chunk_count: int


class DocumentService:
    """Orchestrates the ingestion pipeline, persistence, and file storage."""

    def __init__(self, session: AsyncSession) -> None:
        self._repository = DocumentRepository(session)

    async def upload(
        self,
        *,
        data: bytes,
        filename: str | None,
        document_type: str | None = None,
        case_id: str | None = None,
    ) -> UploadOutcome:
        """Ingest an uploaded file; duplicates (by sha256) are returned, not re-inserted."""
        settings = get_settings()
        max_bytes = settings.max_upload_size_mb * 1024 * 1024
        if len(data) > max_bytes:
            raise FileTooLargeError(
                f"Upload of {len(data)} bytes exceeds the {settings.max_upload_size_mb} MB limit",
                details={"size_bytes": len(data), "max_size_bytes": max_bytes},
            )

        original_filename = filename or "upload"
        safe_filename = Path(original_filename.replace("\\", "/")).name or "upload"
        content_sha256 = hashlib.sha256(data).hexdigest()
        dedup_key = self._deduplication_key(content_sha256, case_id, document_type)
        if case_id is not None:
            await self._repository.ensure_case(case_id)

        existing = await self._repository.get_duplicate(
            dedup_key=dedup_key,
            content_sha256=content_sha256,
            case_id=case_id,
            document_type=document_type,
        )
        if existing is not None:
            chunk_count = await self._repository.count_chunks(existing.id)
            logger.info(
                "document_upload_duplicate",
                document_id=str(existing.id),
                sha256=content_sha256,
            )
            return UploadOutcome(document=existing, duplicate=True, chunk_count=chunk_count)

        mime_type = sniff_mime_type(data, safe_filename)
        document_id = uuid.uuid4()
        try:
            result = run_pipeline(data, safe_filename)
        except DocumentParseError as exc:
            await self._repository.create(
                document_id=document_id,
                filename=safe_filename,
                content_sha256=content_sha256,
                dedup_key=dedup_key,
                mime_type=mime_type,
                size_bytes=len(data),
                page_count=None,
                document_type=document_type,
                case_id=case_id,
                status="failed",
                parser_version=PARSER_VERSION,
                error_message=exc.message,
                doc_metadata={"original_filename": original_filename},
            )
            logger.warning("document_parse_failed", document_id=str(document_id), error=exc.message)
            raise

        stored_path = self._stored_path(document_id, result.mime_type)
        document = await self._repository.create(
            document_id=document_id,
            filename=safe_filename,
            content_sha256=content_sha256,
            dedup_key=dedup_key,
            mime_type=result.mime_type,
            size_bytes=result.size_bytes,
            page_count=result.page_count,
            document_type=document_type,
            case_id=case_id,
            status="parsed",
            parser_version=result.parser_version,
            doc_metadata={
                "original_filename": original_filename,
                "stored_path": stored_path.relative_to(_PROJECT_ROOT).as_posix(),
            },
            elements=result.elements,
            chunks=result.chunks,
        )
        stored_path.parent.mkdir(parents=True, exist_ok=True)
        stored_path.write_bytes(data)
        logger.info(
            "document_uploaded",
            document_id=str(document.id),
            mime_type=result.mime_type,
            chunk_count=len(result.chunks),
        )
        return UploadOutcome(document=document, duplicate=False, chunk_count=len(result.chunks))

    async def get_document(self, document_id: uuid.UUID) -> tuple[Document, int, int]:
        """Return the document with its element and chunk counts, or raise 404."""
        document = await self._require(document_id)
        element_count = await self._repository.count_elements(document_id)
        chunk_count = await self._repository.count_chunks(document_id)
        return document, element_count, chunk_count

    async def list_documents(
        self,
        *,
        document_type: str | None = None,
        case_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Document]:
        return await self._repository.list_documents(
            document_type=document_type,
            case_id=case_id,
            status=status,
            limit=limit,
            offset=offset,
        )

    async def get_chunks(self, document_id: uuid.UUID) -> list[Chunk]:
        """Return the document's chunks in order, or raise 404 if it does not exist."""
        await self._require(document_id)
        return await self._repository.get_chunks(document_id)

    async def delete_document(self, document_id: uuid.UUID) -> None:
        """Delete the document row (children cascade) and its stored file."""
        deleted = await self._repository.delete(document_id)
        if not deleted:
            raise DocumentNotFoundError(f"Document {document_id} not found")
        for path in UPLOAD_DIR.glob(f"{document_id}.*"):
            path.unlink(missing_ok=True)
        logger.info("document_deleted", document_id=str(document_id))

    async def _require(self, document_id: uuid.UUID) -> Document:
        document = await self._repository.get(document_id)
        if document is None:
            raise DocumentNotFoundError(f"Document {document_id} not found")
        return document

    @staticmethod
    def _stored_path(document_id: uuid.UUID, mime_type: str) -> Path:
        extension = EXTENSION_BY_MIME.get(mime_type, ".bin")
        return UPLOAD_DIR / f"{document_id}{extension}"

    @staticmethod
    def _deduplication_key(
        content_sha256: str,
        case_id: str | None,
        document_type: str | None,
    ) -> str:
        """Deduplicate within a logical case/type, not across unrelated cases."""
        scope = f"{content_sha256}\0{case_id or ''}\0{document_type or ''}"
        return hashlib.sha256(scope.encode("utf-8")).hexdigest()
