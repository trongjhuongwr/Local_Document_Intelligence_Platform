"""Compare service: runs the LangGraph discrepancy workflow and persists the run."""

import time
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agents.graph import build_compare_graph
from app.agents.state import CompareWorkflowState
from app.core.exceptions import AppError, StructuredOutputValidationError
from app.core.logging import get_logger
from app.extraction.service import ExtractionService
from app.models import Chunk, Document, ExtractionRun, WorkflowRun
from app.services.reviews import ReviewService

logger = get_logger(__name__)


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
    ) -> None:
        self._sessionmaker = sessionmaker
        self._extraction = extraction_service
        self._reviews = review_service

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
                    select(Chunk.text)
                    .where(Chunk.document_id == document.id)
                    .order_by(Chunk.order_index)
                )
                text = "\n".join(row[0] for row in chunk_rows)
                loaded.append(
                    {
                        "document_id": str(document.id),
                        "filename": document.filename,
                        "document_type": document.document_type,
                        "text": text,
                    }
                )
        return loaded

    async def extract_document(
        self, document_id: str, document_type: str, text: str
    ) -> dict[str, Any] | None:
        document_uuid = uuid.UUID(document_id)
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
        self._graph_services = _GraphServices(sessionmaker, extraction_service, review_service)
        self._graph = build_compare_graph(self._graph_services)

    async def run(
        self, *, document_ids: list[str] | None = None, case_id: str | None = None
    ) -> dict[str, Any]:
        if not document_ids and not case_id:
            raise CompareInputError("Provide either document_ids or case_id")

        run_row = WorkflowRun(
            workflow_type="discrepancy_analysis",
            status="running",
            input_payload={"document_ids": document_ids or [], "case_id": case_id},
        )
        async with self._sessionmaker() as session:
            session.add(run_row)
            await session.commit()
            await session.refresh(run_row)
        workflow_run_id = str(run_row.id)

        started = time.perf_counter()
        initial: CompareWorkflowState = {
            "workflow_run_id": workflow_run_id,
            "case_id": case_id,
            "document_ids": document_ids or [],
            "steps": [],
            "errors": [],
        }
        try:
            state: CompareWorkflowState = await self._graph.ainvoke(initial)
        except Exception:
            async with self._sessionmaker() as session:
                row = await session.get(WorkflowRun, run_row.id)
                if row is not None:
                    row.status = "failed"
                    row.duration_ms = (time.perf_counter() - started) * 1000
                    await session.commit()
            raise

        duration_ms = (time.perf_counter() - started) * 1000
        report = state.get("report", {})
        failed = bool(state.get("errors"))
        async with self._sessionmaker() as session:
            row = await session.get(WorkflowRun, run_row.id)
            if row is not None:
                row.status = "failed" if failed else "completed"
                row.result = report
                row.steps = state.get("steps", [])
                row.errors = state.get("errors", [])
                row.requires_review = state.get("requires_review", False)
                row.duration_ms = duration_ms
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
