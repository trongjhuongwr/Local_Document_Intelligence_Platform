"""Case workspace service: identity, readiness, summaries, and demo provisioning."""

import re
import secrets
import tempfile
import unicodedata
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import CaseConflictError, CaseNotFoundError
from app.models import Case, Document, ReviewTask, WorkflowRun
from app.services.audit import append_projection_event, case_event
from app.services.documents import UPLOAD_DIR, DocumentService
from synthetic_data.generator.builder import build_case
from synthetic_data.generator.pdf_render import render_case_documents

REQUIRED_DOCUMENT_TYPES = ("contract", "invoice", "purchase_order", "policy")
DEMO_CASE_ID = "demo-po-vendor-mismatch"


def slugify_case_name(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return (slug or "case")[:96]


def generate_case_id(name: str) -> str:
    return f"{slugify_case_name(name)}-{secrets.token_hex(2)}"


def calculate_readiness(document_types: set[str]) -> tuple[str, list[str]]:
    missing = [kind for kind in REQUIRED_DOCUMENT_TYPES if kind not in document_types]
    if "contract" in missing or "invoice" in missing:
        return "blocked", missing
    if missing:
        return "limited", missing
    return "complete", []


class CaseService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, name: str, *, source: str = "user", case_id: str | None = None) -> Case:
        clean_name = name.strip()
        if not clean_name:
            raise CaseConflictError("Case name is required")
        identifier = case_id or generate_case_id(clean_name)
        existing = await self._session.get(Case, identifier)
        if existing is not None:
            raise CaseConflictError(f"Case {identifier} already exists")
        case = Case(case_id=identifier, name=clean_name, source=source)
        self._session.add(case)
        # Flush + refresh so the ledger event is appended in the same transaction
        # as the case row, with the server-assigned created_at already loaded.
        await self._session.flush()
        await self._session.refresh(case)
        await append_projection_event(self._session, case_event(case))
        await self._session.commit()
        await self._session.refresh(case)
        return case

    async def ensure_legacy(self, case_id: str) -> Case:
        existing = await self._session.get(Case, case_id)
        if existing is not None:
            return existing
        case = Case(case_id=case_id, name=case_id, source="legacy")
        self._session.add(case)
        await self._session.commit()
        await self._session.refresh(case)
        return case

    async def require(self, case_id: str) -> Case:
        case = await self._session.get(Case, case_id)
        if case is None:
            raise CaseNotFoundError(f"Case {case_id} not found")
        return case

    async def list_cases(self) -> list[dict[str, Any]]:
        cases = list(
            (await self._session.execute(select(Case).order_by(Case.updated_at.desc()))).scalars()
        )
        return [await self.summary(case) for case in cases]

    async def detail(self, case_id: str) -> dict[str, Any]:
        case = await self.require(case_id)
        summary = await self.summary(case)
        documents = list(
            (
                await self._session.execute(
                    select(Document)
                    .where(Document.case_id == case_id)
                    .order_by(Document.created_at.desc())
                )
            )
            .scalars()
            .all()
        )
        summary["documents"] = [
            {
                "document_id": str(document.id),
                "filename": document.filename,
                "document_type": document.document_type,
                "status": document.status,
                "size_bytes": document.size_bytes,
                "page_count": document.page_count,
                "parser_version": document.parser_version,
                "sha256": document.content_sha256,
                "error_message": document.error_message,
                "created_at": document.created_at.isoformat(),
            }
            for document in documents
        ]
        latest = await self._latest_workflow(case_id)
        summary["latest_workflow"] = _workflow_summary(latest) if latest else None
        return summary

    async def summary(self, case: Case) -> dict[str, Any]:
        raw_types = set(
            (
                await self._session.execute(
                    select(Document.document_type).where(
                        Document.case_id == case.case_id, Document.status == "parsed"
                    )
                )
            ).scalars()
        )
        types = {document_type for document_type in raw_types if document_type is not None}
        readiness, missing = calculate_readiness(types)
        document_count = int(
            (
                await self._session.execute(
                    select(func.count())
                    .select_from(Document)
                    .where(Document.case_id == case.case_id)
                )
            ).scalar_one()
        )
        open_count = int(
            (
                await self._session.execute(
                    select(func.count())
                    .select_from(ReviewTask)
                    .where(ReviewTask.case_id == case.case_id, ReviewTask.status == "OPEN")
                )
            ).scalar_one()
        )
        latest = await self._latest_workflow(case.case_id)
        return {
            "case_id": case.case_id,
            "name": case.name,
            "source": case.source,
            "readiness": readiness,
            "missing_document_types": missing,
            "document_types": sorted(types),
            "document_count": document_count,
            "open_review_count": open_count,
            "workflow_status": latest.status if latest else "never_analyzed",
            "last_analyzed_at": (
                (latest.completed_at or latest.created_at).isoformat() if latest else None
            ),
            "created_at": case.created_at.isoformat(),
            "updated_at": case.updated_at.isoformat(),
        }

    async def delete(self, case_id: str) -> None:
        case = await self.require(case_id)
        document_ids = list(
            (
                await self._session.execute(select(Document.id).where(Document.case_id == case_id))
            ).scalars()
        )
        await self._session.delete(case)
        await self._session.commit()
        for document_id in document_ids:
            for path in UPLOAD_DIR.glob(f"{document_id}.*"):
                path.unlink(missing_ok=True)

    async def provision_demo(self) -> dict[str, Any]:
        existing = await self._session.get(Case, DEMO_CASE_ID)
        if existing is None:
            existing = await self.create(
                "PO and vendor mismatch demo", source="demo", case_id=DEMO_CASE_ID
            )
        present = set(
            (
                await self._session.execute(
                    select(Document.document_type).where(Document.case_id == DEMO_CASE_ID)
                )
            ).scalars()
        )
        document_types = {
            "service_contract.pdf": "contract",
            "purchase_order.pdf": "purchase_order",
            "invoice_001.pdf": "invoice",
            "payment_policy.pdf": "policy",
        }
        if not set(document_types.values()).issubset(present):
            with tempfile.TemporaryDirectory(prefix="docintel-demo-") as temp_dir:
                output = Path(temp_dir)
                render_case_documents(build_case(42, 6), output)
                service = DocumentService(self._session)
                for filename, document_type in document_types.items():
                    if document_type in present:
                        continue
                    await service.upload(
                        data=(output / filename).read_bytes(),
                        filename=filename,
                        document_type=document_type,
                        case_id=DEMO_CASE_ID,
                    )
        return await self.detail(DEMO_CASE_ID)

    async def _latest_workflow(self, case_id: str) -> WorkflowRun | None:
        return (
            await self._session.execute(
                select(WorkflowRun)
                .where(WorkflowRun.case_id == case_id)
                .order_by(WorkflowRun.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()


def _workflow_summary(run: WorkflowRun) -> dict[str, Any]:
    return {
        "workflow_id": str(run.id),
        "status": run.status,
        "requires_review": run.requires_review,
        "duration_ms": run.duration_ms,
        "created_at": run.created_at.isoformat(),
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }
