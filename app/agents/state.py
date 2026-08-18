"""LangGraph state for the cross-document discrepancy workflow."""

from typing import Any, TypedDict
from uuid import UUID


class CompareWorkflowState(TypedDict, total=False):
    """State carried through the compare/discrepancy graph.

    Everything is JSON-serialisable so the step trace can be persisted on the
    workflow run row.
    """

    workflow_run_id: str
    case_id: str | None
    document_ids: list[str]
    force_reextract: bool
    # document_id -> {"document_type": ..., "filename": ..., "text_chars": ...}
    documents: dict[str, dict[str, Any]]
    # document_id -> extraction data dict (schema depends on document_type)
    extractions: dict[str, dict[str, Any]]
    extraction_failures: list[dict[str, Any]]
    discrepancies: list[dict[str, Any]]
    review_items: list[dict[str, Any]]
    engine_report: dict[str, Any]
    requires_review: bool
    review_task_ids: list[str]
    report: dict[str, Any]
    report_markdown: str
    steps: list[dict[str, Any]]
    errors: list[str]


def record_step(state: CompareWorkflowState, name: str, **details: Any) -> None:
    state.setdefault("steps", []).append({"step": name, **details})


def state_document_ids(state: CompareWorkflowState) -> list[UUID]:
    return [UUID(document_id) for document_id in state.get("document_ids", [])]
