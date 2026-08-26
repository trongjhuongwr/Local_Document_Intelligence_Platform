"""Case workspace, batch ingestion, demo provisioning, and asynchronous analysis."""

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_compare_service
from app.core.exceptions import AppError, CaseConflictError
from app.core.logging import get_logger
from app.db.session import get_session
from app.retrieval.service import RetrievalService
from app.services.cases import CaseService
from app.services.documents import DocumentService

router = APIRouter(tags=["cases"])
logger = get_logger(__name__)
SessionDep = Annotated[AsyncSession, Depends(get_session)]
DocumentType = Literal["invoice", "contract", "purchase_order", "policy", "other"]


class CreateCaseRequest(BaseModel):
    name: str = Field(min_length=1, max_length=256)


async def _index_documents(document_ids: list[uuid.UUID]) -> None:
    service = RetrievalService()
    for document_id in document_ids:
        try:
            await service.index_document(document_id)
        except Exception as exc:  # indexing is optional for the BM25 product default
            logger.warning(
                "background_index_failed",
                document_id=str(document_id),
                error_type=type(exc).__name__,
            )


@router.post("/cases", status_code=status.HTTP_201_CREATED)
async def create_case(request: CreateCaseRequest, session: SessionDep) -> dict[str, Any]:
    case = await CaseService(session).create(request.name)
    return await CaseService(session).detail(case.case_id)


@router.get("/cases")
async def list_cases(session: SessionDep) -> dict[str, Any]:
    cases = await CaseService(session).list_cases()
    return {"cases": cases, "total": len(cases)}


@router.get("/cases/{case_id}")
async def get_case(case_id: str, session: SessionDep) -> dict[str, Any]:
    return await CaseService(session).detail(case_id)


@router.delete("/cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case(case_id: str, session: SessionDep) -> None:
    await CaseService(session).delete(case_id)


@router.post("/cases/{case_id}/documents")
async def upload_case_documents(
    case_id: str,
    session: SessionDep,
    background_tasks: BackgroundTasks,
    files: Annotated[list[UploadFile], File()],
    document_types: Annotated[list[DocumentType], Form()],
) -> dict[str, Any]:
    await CaseService(session).require(case_id)
    if len(files) != len(document_types):
        raise CaseConflictError("files and document_types must have the same number of items")
    results: list[dict[str, Any]] = []
    indexed: list[uuid.UUID] = []
    service = DocumentService(session)
    for file, document_type in zip(files, document_types, strict=True):
        try:
            outcome = await service.upload(
                data=await file.read(),
                filename=file.filename,
                document_type=document_type,
                case_id=case_id,
            )
        except AppError as exc:
            results.append(
                {
                    "filename": file.filename or "upload",
                    "document_type": document_type,
                    "success": False,
                    "error": exc.error_code,
                    "message": exc.message,
                }
            )
        else:
            indexed.append(outcome.document.id)
            results.append(
                {
                    "filename": outcome.document.filename,
                    "document_type": document_type,
                    "success": True,
                    "document_id": str(outcome.document.id),
                    "duplicate": outcome.duplicate,
                    "chunk_count": outcome.chunk_count,
                    "status": outcome.document.status,
                }
            )
    if indexed:
        background_tasks.add_task(_index_documents, indexed)
    return {
        "case_id": case_id,
        "results": results,
        "success_count": sum(bool(item["success"]) for item in results),
        "failure_count": sum(not item["success"] for item in results),
    }


@router.post("/demo/cases")
async def create_demo_case(
    session: SessionDep, background_tasks: BackgroundTasks
) -> dict[str, Any]:
    detail = await CaseService(session).provision_demo()
    background_tasks.add_task(
        _index_documents,
        [uuid.UUID(document["document_id"]) for document in detail["documents"]],
    )
    return detail


@router.post("/cases/{case_id}/analyses", status_code=status.HTTP_202_ACCEPTED)
async def analyze_case(
    case_id: str, session: SessionDep, background_tasks: BackgroundTasks
) -> dict[str, Any]:
    detail = await CaseService(session).detail(case_id)
    if detail["readiness"] == "blocked":
        raise CaseConflictError(
            "A contract and invoice are required before analysis",
            details={"missing_document_types": detail["missing_document_types"]},
        )
    service = get_compare_service()
    run = await service.create_analysis(case_id)
    if run.status == "queued":
        background_tasks.add_task(service.run_analysis, run.id)
    return {
        "workflow_id": str(run.id),
        "case_id": case_id,
        "status": run.status,
        "existing": run.status == "running",
    }
