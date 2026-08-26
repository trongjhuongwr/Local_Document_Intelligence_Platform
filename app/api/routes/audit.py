"""Audit-trail endpoints.

The response merges two things that are not equally trustworthy, so every entry
carries a ``source`` field and the integrity block reports each half separately.
See ``app/services/audit.py`` and ``app/services/audit_ledger.py``.
"""

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
    MergedAuditTrail,
    attestation_event,
    build_ledger,
    entries_to_csv,
    filter_entries,
)
from app.services.audit_ledger import CHAIN_ALGORITHM

router = APIRouter(prefix="/audit-trail", tags=["audit"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]

CHAIN_NOTE = (
    "Entries labelled source='ledger' are rows appended to the audit_events table at the "
    "moment the action happened. That table has a BEFORE UPDATE OR DELETE trigger that "
    "raises, and its rows are SHA-256 hash-chained (entry_hash = sha256(prev_hash || "
    "canonical_json(payload))); the whole chain is recomputed from the stored rows on "
    "every request. Entries labelled source='projected' are NOT append-only: they are "
    "reconstructions derived at read time from the current contents of the cases, "
    "documents, workflow_runs, review_tasks, query_runs and audit_attestations tables, "
    "and their chain is recomputed from those mutable rows on each request, so it shows "
    "the response is internally consistent but proves nothing about whether the source "
    "rows were edited. Everything recorded before the ledger existed can only be "
    "projected. 'chain_valid' refers to the ledger chain only; the projection's own "
    "recomputation is reported separately as integrity.projected.chain_valid. A projected "
    "entry is omitted when the ledger already holds an entry with the same (action, "
    "entity_type, entity_id), so no action is reported twice."
)

APPEND_ONLY_LIMITATIONS: tuple[str, ...] = (
    "The append-only trigger blocks UPDATE and DELETE, but a superuser or the table owner "
    "(the application's own database role owns audit_events) can drop or disable the "
    "trigger and then edit rows.",
    "TRUNCATE fires a TRUNCATE trigger event, not DELETE, and no TRUNCATE guard is "
    "installed, so TRUNCATE audit_events erases the ledger without error. DROP TABLE and "
    "restoring an older backup are likewise unconstrained.",
    "The hash chain is self-contained and is not anchored to any external notary or second "
    "machine, so an attacker who can rewrite the whole table can recompute every hash and "
    "produce a chain that verifies.",
    "Removal of the newest rows cannot be detected from the chain alone; only removal or "
    "modification in the middle or at the start breaks a link.",
    "The ledger records only the actions that call append_event: case creation, document "
    "ingestion, terminal workflow outcomes, and review decisions/resolutions. Everything "
    "else in this response is a projection.",
    "Verification reads and rehashes the entire audit_events table on every request, which "
    "is O(n) in ledger size.",
)


class AttestationRequest(BaseModel):
    actor: Annotated[str, Field(min_length=1, max_length=256)]
    details: Annotated[str, Field(min_length=1, max_length=4_000)]
    case_id: Annotated[str | None, Field(max_length=128)] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


async def _trail(
    session: AsyncSession,
    *,
    case_id: str | None,
    action: str | None,
    search: str | None,
) -> tuple[list[dict[str, Any]], MergedAuditTrail]:
    """Return (filtered merged entries, the unfiltered trail with its integrity facts)."""
    trail = await AuditService(session).merged_trail()
    filtered = filter_entries(trail.entries, case_id=case_id, action=action, search=search)
    return filtered, trail


def _integrity(trail: MergedAuditTrail, entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Report each half's guarantee separately; never blend the two."""
    verification = trail.ledger_verification
    in_result = {"ledger": 0, "projected": 0}
    for entry in entries:
        key = str(entry.get("source"))
        if key in in_result:
            in_result[key] += 1
    return {
        "ledger": {
            "append_only": True,
            "enforced_by": "audit_events BEFORE UPDATE OR DELETE trigger (row level)",
            "total_rows": verification.checked,
            "entries_in_result": in_result["ledger"],
            "chain_valid": verification.valid,
            "chain_checked": verification.checked,
            "first_broken_sequence": verification.first_broken_sequence,
        },
        "projected": {
            "append_only": False,
            "derivation": "recomputed at read time from live, mutable source tables",
            "total_events": trail.projected_count,
            "entries_in_result": in_result["projected"],
            "chain_valid": trail.projection_chain_valid,
            "chain_proves": (
                "that this response is internally consistent, not that the source rows "
                "were never modified"
            ),
        },
        "deduplication": (
            "a projected entry is omitted when a ledger entry shares its "
            "(action, entity_type, entity_id)"
        ),
        "limitations": list(APPEND_ONLY_LIMITATIONS),
    }


@router.get("")
async def get_audit_trail(
    session: SessionDep,
    case_id: Annotated[str | None, Query(max_length=128)] = None,
    action: Annotated[str | None, Query(max_length=64)] = None,
    search: Annotated[str | None, Query(max_length=256)] = None,
    limit: Annotated[int, Query(ge=1, le=1_000)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    entries, trail = await _trail(session, case_id=case_id, action=action, search=search)
    page = entries[offset : offset + limit]
    return {
        "entries": page,
        "count": len(page),
        "total": len(entries),
        "limit": limit,
        "offset": offset,
        # Ledger chain only. The projection's recomputation lives in `integrity`.
        "chain_valid": trail.ledger_verification.valid,
        "chain_algorithm": CHAIN_ALGORITHM,
        "chain_note": CHAIN_NOTE,
        "integrity": _integrity(trail, entries),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def record_attestation(request: AttestationRequest, session: SessionDep) -> dict[str, Any]:
    """Persist an auditor sign-off.

    The attestation is stored in ``audit_attestations`` and reaches the trail as a
    ``MANUAL_ATTESTATION`` **projection**; it does not write an ``audit_events``
    row, so it carries the projection's weaker guarantee like every other entry
    sourced from a mutable table.
    """
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
        "source": entry["source"],
    }


@router.get("/export")
async def export_audit_trail(
    session: SessionDep,
    case_id: Annotated[str | None, Query(max_length=128)] = None,
    action: Annotated[str | None, Query(max_length=64)] = None,
    search: Annotated[str | None, Query(max_length=256)] = None,
    export_format: Annotated[Literal["csv", "json"], Query(alias="format")] = "csv",
) -> Response:
    entries, trail = await _trail(session, case_id=case_id, action=action, search=search)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    scope = case_id or "all-cases"
    filename = f"audit-trail_{scope}_{stamp}.{export_format}"
    disposition = f'attachment; filename="{filename}"'

    if export_format == "json":
        payload = {
            "entries": entries,
            "total": len(entries),
            "chain_valid": trail.ledger_verification.valid,
            "chain_algorithm": CHAIN_ALGORITHM,
            "chain_note": CHAIN_NOTE,
            "integrity": _integrity(trail, entries),
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
