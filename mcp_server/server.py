"""Read-only MCP server over the document-intelligence platform.

Five allowlisted tools expose retrieval, document metadata, extracted fields,
deterministic discrepancy analysis, and the human-review queue. Every tool is
read-only by construction: SELECT-only ORM queries through the existing
services/repositories plus the pure :func:`analyze_case` rule engine. No tool
writes rows (no ``WorkflowRun``, ``ReviewTask``, or ``ExtractionRun`` inserts),
invokes the LLM extractor, executes arbitrary SQL, or touches the filesystem.

Backend failures (Postgres down, Ollama unreachable for dense/hybrid search)
surface as structured ``{"error": ...}`` payloads, never tracebacks.
"""

from __future__ import annotations

import functools
import uuid
from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.graph import case_documents_from_extractions
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.db.session import get_sessionmaker
from app.discrepancy.engine import analyze_case
from app.models import Document, ExtractionRun, ReviewTask
from app.repositories.documents import DocumentRepository
from app.retrieval.base import RetrievalMode, SearchFilters
from app.retrieval.service import RetrievalService
from app.services.reviews import ReviewService

logger = get_logger(__name__)

_VALID_MODES = ("bm25", "dense", "hybrid")
_SNIPPET_MAX_CHARS = 300
_MAX_TOP_K = 50
_MAX_REVIEW_LIMIT = 200
_MAX_CASE_DOCUMENTS = 200

_READ_ONLY = ToolAnnotations(
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)

mcp = MCPServer(
    "document-intelligence",
    instructions=(
        "Read-only access to the local document-intelligence platform: search document "
        "chunks (BM25 / dense / hybrid), fetch document metadata and extracted fields, "
        "run the deterministic cross-document discrepancy analysis over already-stored "
        "extractions, and list human-review findings. No tool writes any data."
    ),
)


@dataclass
class Services:
    """The read-only backends behind the tools.

    Built lazily by :func:`_get_services`; unit tests monkeypatch that accessor
    with stub objects exposing the same attributes.
    """

    sessionmaker: async_sessionmaker[AsyncSession]
    retrieval: RetrievalService
    reviews: ReviewService


_services: Services | None = None


def _get_services() -> Services:
    """Lazily build and cache the shared service container."""
    global _services
    if _services is None:
        sessionmaker = get_sessionmaker()
        _services = Services(
            sessionmaker=sessionmaker,
            retrieval=RetrievalService(sessionmaker=sessionmaker),
            reviews=ReviewService(sessionmaker),
        )
    return _services


def _error(message: str, **extra: Any) -> dict[str, Any]:
    return {"error": message, **extra}


def _guarded[**P](
    fn: Callable[P, Coroutine[Any, Any, dict[str, Any]]],
) -> Callable[P, Coroutine[Any, Any, dict[str, Any]]]:
    """Convert backend failures into ``{"error": ...}`` payloads, never tracebacks."""

    @functools.wraps(fn)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> dict[str, Any]:
        try:
            return await fn(*args, **kwargs)
        except AppError as exc:
            logger.warning("mcp_tool_failed", tool=fn.__name__, error=exc.message)
            return _error(exc.message)
        except (SQLAlchemyError, OSError) as exc:
            logger.warning("mcp_tool_backend_unavailable", tool=fn.__name__, error=str(exc))
            return _error(f"backend unavailable: {exc.__class__.__name__}: {exc}")
        except Exception as exc:
            logger.error("mcp_tool_unexpected_error", tool=fn.__name__, error=str(exc))
            return _error(f"unexpected error: {exc.__class__.__name__}: {exc}")

    return wrapper


def _snippet(text: str) -> str:
    """Collapse whitespace and cap the text at ``_SNIPPET_MAX_CHARS`` characters."""
    compact = " ".join(text.split())
    if len(compact) <= _SNIPPET_MAX_CHARS:
        return compact
    return compact[: _SNIPPET_MAX_CHARS - 3].rstrip() + "..."


def _parse_uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        return None


async def _latest_valid_extraction(
    session: AsyncSession, document_id: uuid.UUID
) -> ExtractionRun | None:
    """Newest schema-valid extraction run for a document, or None."""
    result = await session.execute(
        select(ExtractionRun)
        .where(
            ExtractionRun.document_id == document_id,
            ExtractionRun.schema_valid.is_(True),
        )
        .order_by(ExtractionRun.created_at.desc(), ExtractionRun.id)
        .limit(1)
    )
    return result.scalars().first()


def _document_metadata(document: Document) -> dict[str, Any]:
    return {
        "id": str(document.id),
        "filename": document.filename,
        "document_type": document.document_type,
        "case_id": document.case_id,
        "status": document.status,
        "page_count": document.page_count,
        "size_bytes": document.size_bytes,
        "sha256": document.content_sha256,
        "created_at": document.created_at.isoformat(),
    }


@mcp.tool(annotations=_READ_ONLY)
@_guarded
async def search_documents(
    query: str,
    mode: str = "hybrid",
    top_k: int = 5,
    case_id: str | None = None,
    document_type: str | None = None,
) -> dict[str, Any]:
    """Search document chunks with lexical, dense, or hybrid retrieval.

    mode must be one of 'bm25' (works without Ollama), 'dense', or 'hybrid'
    (both need the local Ollama embedding model). Optional case_id and
    document_type narrow the corpus. Returns ranked chunks with a text snippet
    (at most 300 characters), the retrieval score, and chunk/document ids.
    """
    normalized_mode = mode.strip().lower()
    if normalized_mode not in _VALID_MODES:
        return _error(
            f"invalid mode {mode!r}: must be one of 'bm25', 'dense', or 'hybrid'"
        )
    if not 1 <= top_k <= _MAX_TOP_K:
        return _error(f"top_k must be between 1 and {_MAX_TOP_K}, got {top_k}")
    logger.info(
        "mcp_tool_invoked",
        tool="search_documents",
        query=query,
        mode=normalized_mode,
        top_k=top_k,
        case_id=case_id,
        document_type=document_type,
    )
    services = _get_services()
    chunks = await services.retrieval.search(
        query,
        mode=RetrievalMode(normalized_mode),
        top_k=top_k,
        filters=SearchFilters(case_id=case_id, document_type=document_type),
    )
    return {
        "results": [
            {
                "filename": chunk.filename,
                "document_type": chunk.document_type,
                "page_number": chunk.page_number,
                "section": chunk.section,
                "snippet": _snippet(chunk.text),
                "score": chunk.score,
                "chunk_id": str(chunk.chunk_id),
                "document_id": str(chunk.document_id),
            }
            for chunk in chunks
        ]
    }


@mcp.tool(annotations=_READ_ONLY)
@_guarded
async def get_document(document_id: str) -> dict[str, Any]:
    """Fetch stored metadata for one document by its UUID.

    Returns id, filename, document_type, case_id, status, page_count,
    size_bytes, sha256, and created_at, or {"error": ...} when the id is not a
    valid UUID or no such document exists.
    """
    logger.info("mcp_tool_invoked", tool="get_document", document_id=document_id)
    parsed = _parse_uuid(document_id)
    if parsed is None:
        return _error(f"invalid document id {document_id!r}: not a UUID")
    services = _get_services()
    async with services.sessionmaker() as session:
        document = await DocumentRepository(session).get(parsed)
    if document is None:
        return _error(f"document {document_id} not found")
    return _document_metadata(document)


@mcp.tool(annotations=_READ_ONLY)
@_guarded
async def get_document_fields(document_id: str) -> dict[str, Any]:
    """Fetch the latest schema-valid extracted fields for one document.

    Returns the stored structured-extraction data (invoice/contract/purchase
    order/policy fields) from the newest schema-valid extraction run, plus
    document_type, extracted_at, and prompt_version. Never triggers a new LLM
    extraction; documents without a stored valid extraction yield
    {"error": "no extraction available"}.
    """
    logger.info("mcp_tool_invoked", tool="get_document_fields", document_id=document_id)
    parsed = _parse_uuid(document_id)
    if parsed is None:
        return _error(f"invalid document id {document_id!r}: not a UUID")
    services = _get_services()
    async with services.sessionmaker() as session:
        run = await _latest_valid_extraction(session, parsed)
    if run is None:
        return _error("no extraction available", document_id=document_id)
    return {
        "document_id": document_id,
        "document_type": run.document_type,
        "data": dict(run.data),
        "extracted_at": run.created_at.isoformat(),
        "prompt_version": run.prompt_version,
    }


@mcp.tool(annotations=_READ_ONLY)
@_guarded
async def compare_documents(case_id: str) -> dict[str, Any]:
    """Run the deterministic discrepancy analysis over a case, read-only.

    Loads the parsed documents of the case, collects each one's latest stored
    schema-valid extraction (documents lacking one are listed under
    missing_extractions; the LLM is never invoked), and runs the pure rule
    engine over them. Nothing is persisted: no workflow runs, review tasks, or
    extraction runs are created.
    """
    logger.info("mcp_tool_invoked", tool="compare_documents", case_id=case_id)
    services = _get_services()
    documents_info: dict[str, dict[str, Any]] = {}
    extractions: dict[str, dict[str, Any]] = {}
    missing: list[dict[str, Any]] = []
    async with services.sessionmaker() as session:
        documents = await DocumentRepository(session).list_documents(
            case_id=case_id, status="parsed", limit=_MAX_CASE_DOCUMENTS
        )
        if not documents:
            return _error(f"no parsed documents found for case {case_id!r}")
        for document in documents:
            info = {"filename": document.filename, "document_type": document.document_type}
            run = await _latest_valid_extraction(session, document.id)
            if run is None:
                missing.append({"document_id": str(document.id), **info})
            else:
                documents_info[str(document.id)] = info
                extractions[str(document.id)] = dict(run.data)
    case = case_documents_from_extractions(documents_info, extractions)
    report = analyze_case(case)
    logger.info(
        "mcp_compare_completed",
        case_id=case_id,
        findings=len(report.discrepancies),
        missing_extractions=len(missing),
    )
    return {
        "case_id": case_id,
        "report": report.model_dump(mode="json"),
        "missing_extractions": missing,
        "note": (
            "read-only analysis over stored extractions; no workflow runs, review "
            "tasks, or LLM extraction runs were created"
        ),
    }


@mcp.tool(annotations=_READ_ONLY)
@_guarded
async def get_review_findings(
    status: str | None = None,
    case_id: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """List human-review tasks created from detected discrepancies.

    Optional filters: status (OPEN, APPROVED, REJECTED, RESOLVED;
    case-insensitive) and case_id. Returns the newest tasks first with their
    severity, status, the underlying discrepancy payload, reviewer, and
    decision/creation timestamps.
    """
    if not 1 <= limit <= _MAX_REVIEW_LIMIT:
        return _error(f"limit must be between 1 and {_MAX_REVIEW_LIMIT}, got {limit}")
    normalized_status = status.strip().upper() if status is not None else None
    logger.info(
        "mcp_tool_invoked",
        tool="get_review_findings",
        status=normalized_status,
        case_id=case_id,
        limit=limit,
    )
    services = _get_services()
    tasks: list[ReviewTask] = await services.reviews.list_tasks(
        status=normalized_status, case_id=case_id, limit=limit
    )
    return {
        "reviews": [
            {
                "review_id": str(task.id),
                "case_id": task.case_id,
                "severity": task.severity,
                "status": task.status,
                "discrepancy": dict(task.discrepancy),
                "reviewer": task.reviewer,
                "decided_at": task.decided_at.isoformat() if task.decided_at else None,
                "created_at": task.created_at.isoformat(),
            }
            for task in tasks
        ]
    }
