"""Compare service: runs the LangGraph discrepancy workflow and persists the run."""

import time
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.graph import build_compare_graph
from app.agents.state import CompareWorkflowState
from app.core.config import get_settings
from app.core.exceptions import AppError, StructuredOutputValidationError
from app.core.logging import get_logger
from app.extraction.service import ExtractionService
from app.models import Case, Chunk, Document, ExtractionRun, WorkflowRun
from app.services.reviews import ReviewService

logger = get_logger(__name__)

WORKFLOW_STEPS = [
    ("load_documents", "Load documents"),
    ("extract_fields", "Extract structured fields"),
    ("run_discrepancy_rules", "Run deterministic checks"),
    ("create_review_tasks", "Create review tasks"),
    ("generate_report", "Build report"),
]


def initial_workflow_steps() -> list[dict[str, Any]]:
    return [
        {"step": step, "label": label, "status": "pending", "details": {}}
        for step, label in WORKFLOW_STEPS
    ]


class CompareInputError(AppError):
    status_code = 422
    error_code = "compare_input_error"


class _GraphServices:
    """Concrete CompareServices implementation over the database + LLM."""

    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        extraction_service: ExtractionService,
        review_service: ReviewService,
        progress_callback: Any | None = None,
    ) -> None:
        self._sessionmaker = sessionmaker
        self._extraction = extraction_service
        self._reviews = review_service
        self._progress_callback = progress_callback

    async def record_progress(
        self, workflow_run_id: str | None, step: str, details: dict[str, Any]
    ) -> None:
        if workflow_run_id and self._progress_callback is not None:
            await self._progress_callback(uuid.UUID(workflow_run_id), step, details)

    async def load_documents(
        self, document_ids: list[str], case_id: str | None
    ) -> list[dict[str, Any]]:
        statement = select(Document).where(Document.status == "parsed")
        if document_ids:
            statement = statement.where(
                Document.id.in_([uuid.UUID(document_id) for document_id in document_ids])
            )
        elif case_id:
            statement = statement.where(Document.case_id == case_id)
        else:
            raise CompareInputError("Provide either document_ids or case_id")

        loaded: list[dict[str, Any]] = []
        async with self._sessionmaker() as session:
            documents = list((await session.execute(statement)).scalars().all())
            for document in documents:
                if document.document_type not in {
                    "invoice",
                    "contract",
                    "purchase_order",
                    "policy",
                }:
                    continue
                chunk_rows = await session.execute(
                    select(Chunk.text, Chunk.page_number)
                    .where(Chunk.document_id == document.id)
                    .order_by(Chunk.order_index)
                )
                chunks = [{"text": row[0], "page_number": row[1]} for row in chunk_rows]
                text = "\n".join(chunk["text"] for chunk in chunks)
                loaded.append(
                    {
                        "document_id": str(document.id),
                        "filename": document.filename,
                        "document_type": document.document_type,
                        "text": text,
                        "chunks": chunks,
                    }
                )
        return loaded

    async def extract_document(
        self,
        document_id: str,
        document_type: str,
        text: str,
        *,
        force_reextract: bool = False,
    ) -> dict[str, Any] | None:
        document_uuid = uuid.UUID(document_id)
        if not force_reextract:
            async with self._sessionmaker() as session:
                existing = await session.execute(
                    select(ExtractionRun)
                    .where(
                        ExtractionRun.document_id == document_uuid,
                        ExtractionRun.schema_valid.is_(True),
                    )
                    .order_by(ExtractionRun.created_at.desc())
                    .limit(1)
                )
                run = existing.scalar_one_or_none()
                if run is not None:
                    return dict(run.data)

        try:
            outcome = await self._extraction.extract(document_type, text)
        except StructuredOutputValidationError as exc:
            logger.warning("extraction_failed", document_id=document_id, error=exc.message)
            async with self._sessionmaker() as session:
                session.add(
                    ExtractionRun(
                        document_id=document_uuid,
                        document_type=document_type,
                        data={},
                        method="ollama_structured",
                        prompt_name=f"extraction_{document_type}",
                        prompt_version="1",
                        schema_valid=False,
                        telemetry={"error": exc.message},
                    )
                )
                await session.commit()
            return None

        data = outcome.data.model_dump(mode="json")
        async with self._sessionmaker() as session:
            session.add(
                ExtractionRun(
                    document_id=document_uuid,
                    document_type=document_type,
                    data=data,
                    method=outcome.method,
                    prompt_name=outcome.prompt_name,
                    prompt_version=outcome.prompt_version,
                    schema_valid=True,
                    telemetry=outcome.telemetry.model_dump(mode="json"),
                )
            )
            await session.commit()
        return data

    async def create_review_tasks(
        self,
        workflow_run_id: str | None,
        case_id: str | None,
        discrepancies: list[dict[str, Any]],
    ) -> list[str]:
        return await self._reviews.create_many(workflow_run_id, case_id, discrepancies)


class CompareService:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        extraction_service: ExtractionService,
        review_service: ReviewService,
    ) -> None:
        self._sessionmaker = sessionmaker
        self._extraction_service = extraction_service
        self._review_service = review_service

    async def run(
        self,
        *,
        document_ids: list[str] | None = None,
        case_id: str | None = None,
        force_reextract: bool = False,
    ) -> dict[str, Any]:
        if bool(document_ids) == (case_id is not None):
            raise CompareInputError("Provide exactly one of document_ids or case_id")

        run_row = WorkflowRun(
            workflow_type="discrepancy_analysis",
            status="running",
            case_id=case_id,
            input_payload={
                "document_ids": document_ids or [],
                "case_id": case_id,
                "force_reextract": force_reextract,
            },
        )
        async with self._sessionmaker() as session:
            session.add(run_row)
            await session.commit()
            await session.refresh(run_row)
        return await self._execute(run_row.id, raise_errors=True)

    async def create_analysis(self, case_id: str) -> WorkflowRun:
        """Create a queued analysis, returning the active one on duplicate requests."""
        async with self._sessionmaker() as session:
            active = (
                await session.execute(
                    select(WorkflowRun)
                    .where(
                        WorkflowRun.case_id == case_id,
                        WorkflowRun.status.in_(["queued", "running"]),
                    )
                    .order_by(WorkflowRun.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if active is not None:
                return active
            run = WorkflowRun(
                workflow_type="discrepancy_analysis",
                case_id=case_id,
                status="queued",
                input_payload={"document_ids": [], "case_id": case_id, "force_reextract": False},
                steps=initial_workflow_steps(),
            )
            case = await session.get(Case, case_id)
            if case is not None:
                case.updated_at = datetime.now(UTC)
            session.add(run)
            try:
                await session.commit()
            except IntegrityError:
                await session.rollback()
                active = (
                    await session.execute(
                        select(WorkflowRun).where(
                            WorkflowRun.case_id == case_id,
                            WorkflowRun.status.in_(["queued", "running"]),
                        )
                    )
                ).scalar_one()
                return active
            await session.refresh(run)
            return run

    async def run_analysis(self, workflow_id: uuid.UUID) -> None:
        """Execute a queued analysis in the API background task."""
        await self._execute(workflow_id, raise_errors=False)

    async def _execute(self, workflow_id: uuid.UUID, *, raise_errors: bool) -> dict[str, Any]:
        async with self._sessionmaker() as session:
            run_row = await session.get(WorkflowRun, workflow_id)
            if run_row is None:
                raise CompareInputError(f"Workflow {workflow_id} does not exist")
            run_row.status = "running"
            run_row.started_at = datetime.now(UTC)
            steps = list(run_row.steps) or initial_workflow_steps()
            if steps:
                steps[0] = {**steps[0], "status": "running"}
            run_row.steps = steps
            await session.commit()
            payload = dict(run_row.input_payload)

        workflow_run_id = str(workflow_id)
        graph_services = _GraphServices(
            self._sessionmaker,
            self._extraction_service,
            self._review_service,
            self._record_progress,
        )
        graph = build_compare_graph(graph_services)

        started = time.perf_counter()
        initial: CompareWorkflowState = {
            "workflow_run_id": workflow_run_id,
            "case_id": payload.get("case_id"),
            "document_ids": payload.get("document_ids", []),
            "force_reextract": bool(payload.get("force_reextract", False)),
            "steps": [],
            "errors": [],
        }
        try:
            state: CompareWorkflowState = await graph.ainvoke(initial)
        except Exception as exc:
            async with self._sessionmaker() as session:
                row = await session.get(WorkflowRun, workflow_id)
                if row is not None:
                    row.status = "failed"
                    row.duration_ms = (time.perf_counter() - started) * 1000
                    row.completed_at = datetime.now(UTC)
                    row.errors = [f"{type(exc).__name__}: {exc}"]
                    await session.commit()
            logger.exception("compare_workflow_failed", workflow_id=workflow_run_id)
            if raise_errors:
                raise
            return {"workflow_id": workflow_run_id, "status": "failed", "errors": [str(exc)]}

        duration_ms = (time.perf_counter() - started) * 1000
        report = state.get("report", {})
        report["model_version"] = get_settings().ollama_llm_model
        report["workflow_completed_at"] = datetime.now(UTC).isoformat()
        failed = bool(state.get("errors"))
        async with self._sessionmaker() as session:
            row = await session.get(WorkflowRun, workflow_id)
            if row is not None:
                row.status = "failed" if failed else "completed"
                row.result = {**report, "report_markdown": state.get("report_markdown", "")}
                row.errors = state.get("errors", [])
                row.requires_review = state.get("requires_review", False)
                row.duration_ms = duration_ms
                row.completed_at = datetime.now(UTC)
                if row.case_id is not None:
                    case = await session.get(Case, row.case_id)
                    if case is not None:
                        case.updated_at = datetime.now(UTC)
                await session.commit()

        logger.info(
            "compare_workflow_finished",
            workflow_id=workflow_run_id,
            status="failed" if failed else "completed",
            findings=len(state.get("discrepancies", [])),
            duration_ms=round(duration_ms, 1),
        )
        return {
            "workflow_id": workflow_run_id,
            "status": "failed" if failed else "completed",
            "report": report,
            "report_markdown": state.get("report_markdown", ""),
            "discrepancies": state.get("discrepancies", []),
            "review_task_ids": state.get("review_task_ids", []),
            "requires_human_review": state.get("requires_review", False),
            "errors": state.get("errors", []),
            "duration_ms": round(duration_ms, 1),
        }

    async def _record_progress(
        self, workflow_id: uuid.UUID, completed_step: str, details: dict[str, Any]
    ) -> None:
        async with self._sessionmaker() as session:
            row = await session.get(WorkflowRun, workflow_id)
            if row is None:
                return
            steps = list(row.steps) or initial_workflow_steps()
            completed_index = next(
                (index for index, item in enumerate(steps) if item["step"] == completed_step), None
            )
            if completed_index is None:
                return
            steps[completed_index] = {
                **steps[completed_index],
                "status": "completed",
                "details": details,
                "completed_at": datetime.now(UTC).isoformat(),
            }
            if completed_index + 1 < len(steps):
                steps[completed_index + 1] = {**steps[completed_index + 1], "status": "running"}
            row.steps = steps
            await session.commit()
