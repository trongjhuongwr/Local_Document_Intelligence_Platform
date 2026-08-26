"""Audit-trail endpoints backed by real persisted rows (see app/services/audit.py)."""

import json
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.services.audit import (
    AuditService,
    attestation_event,
    build_ledger,
    entries_to_csv,
    filter_entries,
    verify_ledger,
)

router = APIRouter(prefix="/audit-trail", tags=["audit"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]

CHAIN_NOTE = (
    "Entries are projected from the documents, workflow_runs, review_tasks, query_runs, "
    "cases and audit_attestations tables. The SHA-256 chain is computed over those "
    "projected events at read time and re-verified before the response is returned; it "
    "is not a write-time append-only ledger."
)


class AttestationRequest(BaseModel):
    actor: Annotated[str, Field(min_length=1, max_length=256)]
    details: Annotated[str, Field(min_length=1, max_length=4_000)]
    case_id: Annotated[str | None, Field(max_length=128)] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


async def _ledger(
    session: AsyncSession,
    *,
    case_id: str | None,
    action: str | None,
    search: str | None,
) -> tuple[list[dict[str, Any]], bool]:
    """Return (filtered entries, chain validity of the complete ledger)."""
    full = await AuditService(session).ledger()
    return filter_entries(full, case_id=case_id, action=action, search=search), verify_ledger(full)


@router.get("")
async def get_audit_trail(
    session: SessionDep,
    case_id: Annotated[str | None, Query(max_length=128)] = None,
    action: Annotated[str | None, Query(max_length=64)] = None,
    search: Annotated[str | None, Query(max_length=256)] = None,
    limit: Annotated[int, Query(ge=1, le=1_000)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    entries, chain_valid = await _ledger(session, case_id=case_id, action=action, search=search)
    page = entries[offset : offset + limit]
    return {
        "entries": page,
        "count": len(page),
        "total": len(entries),
        "limit": limit,
        "offset": offset,
        "chain_valid": chain_valid,
        "chain_algorithm": "sha256",
        "chain_note": CHAIN_NOTE,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def record_attestation(request: AttestationRequest, session: SessionDep) -> dict[str, Any]:
    """Persist an auditor sign-off; it becomes a MANUAL_ATTESTATION ledger event."""
    attestation = await AuditService(session).record_attestation(
        actor=request.actor,
        details=request.details,
        case_id=request.case_id,
        metadata=request.metadata,
    )
    entry = build_ledger([attestation_event(attestation)])[0]
    return {
        "attestation_id": str(attestation.id),
        "case_id": attestation.case_id,
        "actor": attestation.actor,
        "details": attestation.details,
        "metadata": attestation.attestation_metadata,
        "created_at": attestation.created_at.isoformat(),
        "log_id": entry["log_id"],
    }


@router.get("/export")
async def export_audit_trail(
    session: SessionDep,
    case_id: Annotated[str | None, Query(max_length=128)] = None,
    action: Annotated[str | None, Query(max_length=64)] = None,
    search: Annotated[str | None, Query(max_length=256)] = None,
    export_format: Annotated[Literal["csv", "json"], Query(alias="format")] = "csv",
) -> Response:
    entries, chain_valid = await _ledger(session, case_id=case_id, action=action, search=search)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    scope = case_id or "all-cases"
    filename = f"audit-trail_{scope}_{stamp}.{export_format}"
    disposition = f'attachment; filename="{filename}"'

    if export_format == "json":
        payload = {
            "entries": entries,
            "total": len(entries),
            "chain_valid": chain_valid,
            "chain_algorithm": "sha256",
            "chain_note": CHAIN_NOTE,
            "exported_at": datetime.now(UTC).isoformat(),
            "filters": {"case_id": case_id, "action": action, "search": search},
        }
        return Response(
            content=json.dumps(payload, indent=2, default=str),
            media_type="application/json",
            headers={"Content-Disposition": disposition},
        )

    return PlainTextResponse(
        content=entries_to_csv(entries),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": disposition},
    )
