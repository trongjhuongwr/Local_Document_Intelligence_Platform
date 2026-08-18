"""LangGraph workflow for cross-document discrepancy analysis.

The graph is a single explicit state machine — no free-form agent loops. LLM
work happens only inside the extraction step (bounded, schema-validated);
every other node is deterministic software:

    START -> load_documents -> extract_fields -> run_rules
          -> (discrepancies? create_review_tasks : skip) -> generate_report -> END
"""

from typing import Any, Protocol
from uuid import UUID

from langgraph.graph import END, START, StateGraph

from app.agents.state import CompareWorkflowState, record_step
from app.core.logging import get_logger
from app.discrepancy.engine import analyze_case
from app.discrepancy.evidence import attach_evidence, extraction_failure_review_item
from app.discrepancy.models import CaseDocuments, DiscrepancyReport, InvoiceRecord
from app.extraction.schemas import (
    ContractExtraction,
    InvoiceExtraction,
    PolicyExtraction,
    PurchaseOrderExtraction,
)
from app.workflows.report import build_exception_report, report_to_markdown

logger = get_logger(__name__)


class CompareServices(Protocol):
    """The side-effectful operations the graph needs, injected for testability."""

    async def load_documents(
        self, document_ids: list[str], case_id: str | None
    ) -> list[dict[str, Any]]:
        """Return [{document_id, filename, document_type, text}, ...]."""
        ...

    async def extract_document(
        self,
        document_id: str,
        document_type: str,
        text: str,
        *,
        force_reextract: bool = False,
    ) -> dict[str, Any] | None:
        """Extract structured fields; None if extraction failed after retries."""
        ...

    async def create_review_tasks(
        self,
        workflow_run_id: str | None,
        case_id: str | None,
        discrepancies: list[dict[str, Any]],
    ) -> list[str]: ...


def case_documents_from_extractions(
    documents: dict[str, dict[str, Any]], extractions: dict[str, dict[str, Any]]
) -> CaseDocuments:
    """Assemble the discrepancy-engine input from per-document extractions."""
    case = CaseDocuments()
    for document_id, extraction in extractions.items():
        info = documents.get(document_id, {})
        document_type = info.get("document_type")
        if document_type == "contract" and case.contract is None:
            case.contract = ContractExtraction.model_validate(extraction)
        elif document_type == "purchase_order" and case.purchase_order is None:
            case.purchase_order = PurchaseOrderExtraction.model_validate(extraction)
        elif document_type == "policy" and case.policy is None:
            case.policy = PolicyExtraction.model_validate(extraction)
        elif document_type == "invoice":
            try:
                document_uuid: UUID | None = UUID(document_id)
            except ValueError:
                document_uuid = None
            case.invoices.append(
                InvoiceRecord(
                    extraction=InvoiceExtraction.model_validate(extraction),
                    filename=info.get("filename"),
                    document_id=document_uuid,
                )
            )
    return case


def build_compare_graph(services: CompareServices) -> Any:
    async def notify(state: CompareWorkflowState, step: str, **details: Any) -> None:
        callback = getattr(services, "record_progress", None)
        if callback is not None:
            await callback(state.get("workflow_run_id"), step, details)

    async def load_documents(state: CompareWorkflowState) -> CompareWorkflowState:
        loaded = await services.load_documents(state.get("document_ids", []), state.get("case_id"))
        documents = {
            item["document_id"]: {
                "filename": item["filename"],
                "document_type": item["document_type"],
                "text": item["text"],
                "chunks": item.get("chunks", []),
            }
            for item in loaded
        }
        errors = list(state.get("errors", []))
        if not documents:
            errors.append("No parsed documents found for the requested scope")
        record_step(state, "load_documents", count=len(documents))
        await notify(state, "load_documents", count=len(documents))
        return {
            "documents": documents,
            "document_ids": list(documents),
            "steps": state.get("steps", []),
            "errors": errors,
        }

    async def extract_fields(state: CompareWorkflowState) -> CompareWorkflowState:
        extractions: dict[str, dict[str, Any]] = {}
        failures: list[dict[str, Any]] = []
        for document_id, info in state.get("documents", {}).items():
            data = await services.extract_document(
                document_id,
                info["document_type"],
                info["text"],
                force_reextract=state.get("force_reextract", False),
            )
            if data is None:
                failures.append(
                    {
                        "document_id": document_id,
                        "filename": info["filename"],
                        "error": "structured extraction failed schema validation",
                    }
                )
            else:
                extractions[document_id] = data
        record_step(state, "extract_fields", extracted=len(extractions), failed=len(failures))
        await notify(state, "extract_fields", extracted=len(extractions), failed=len(failures))
        return {
            "extractions": extractions,
            "extraction_failures": failures,
            "steps": state.get("steps", []),
        }

    async def run_rules(state: CompareWorkflowState) -> CompareWorkflowState:
        case = case_documents_from_extractions(
            state.get("documents", {}), state.get("extractions", {})
        )
        report = analyze_case(case)
        enriched = attach_evidence(
            report.discrepancies,
            state.get("documents", {}),
            state.get("extractions", {}),
        )
        report = report.model_copy(update={"discrepancies": enriched})
        discrepancies = [d.model_dump(mode="json") for d in enriched]
        failure_items = [
            extraction_failure_review_item(failure, state.get("documents", {}))
            for failure in state.get("extraction_failures", [])
        ]
        # Extraction failures force human review: silence must never look like a pass.
        requires_review = report.requires_human_review or bool(state.get("extraction_failures"))
        record_step(
            state,
            "run_discrepancy_rules",
            checks_run=report.checks_run,
            findings=len(discrepancies),
        )
        await notify(
            state,
            "run_discrepancy_rules",
            checks_run=report.checks_run,
            findings=len(discrepancies),
        )
        return {
            "discrepancies": discrepancies,
            "review_items": [*discrepancies, *failure_items],
            "engine_report": report.model_dump(mode="json"),
            "requires_review": requires_review,
            "steps": state.get("steps", []),
        }

    async def create_review_tasks(state: CompareWorkflowState) -> CompareWorkflowState:
        task_ids = await services.create_review_tasks(
            state.get("workflow_run_id"),
            state.get("case_id"),
            state.get("review_items", []),
        )
        record_step(state, "create_review_tasks", created=len(task_ids))
        await notify(state, "create_review_tasks", created=len(task_ids))
        return {"review_task_ids": task_ids, "steps": state.get("steps", [])}

    async def generate_report(state: CompareWorkflowState) -> CompareWorkflowState:
        if not state.get("review_items"):
            await notify(state, "create_review_tasks", created=0, skipped=True)
        engine_report = DiscrepancyReport.model_validate(state["engine_report"])
        documents_meta = [
            {
                "document_id": document_id,
                "filename": info["filename"],
                "document_type": info["document_type"],
            }
            for document_id, info in state.get("documents", {}).items()
        ]
        report = build_exception_report(
            engine_report,
            case_id=state.get("case_id"),
            documents=documents_meta,
            extraction_failures=state.get("extraction_failures", []),
        )
        report["requires_human_review"] = state.get("requires_review", False)
        report["review_task_ids"] = state.get("review_task_ids", [])
        record_step(state, "generate_report", issues=report["issue_count"])
        await notify(state, "generate_report", issues=report["issue_count"])
        return {
            "report": report,
            "report_markdown": report_to_markdown(report),
            "steps": state.get("steps", []),
        }

    def has_review_items(state: CompareWorkflowState) -> str:
        return "create_review_tasks" if state.get("review_items") else "generate_report"

    graph: StateGraph = StateGraph(CompareWorkflowState)
    graph.add_node("load_documents", load_documents)
    graph.add_node("extract_fields", extract_fields)
    graph.add_node("run_rules", run_rules)
    graph.add_node("create_review_tasks", create_review_tasks)
    graph.add_node("generate_report", generate_report)

    graph.add_edge(START, "load_documents")
    graph.add_edge("load_documents", "extract_fields")
    graph.add_edge("extract_fields", "run_rules")
    graph.add_conditional_edges(
        "run_rules",
        has_review_items,
        {"create_review_tasks": "create_review_tasks", "generate_report": "generate_report"},
    )
    graph.add_edge("create_review_tasks", "generate_report")
    graph.add_edge("generate_report", END)
    return graph.compile()
