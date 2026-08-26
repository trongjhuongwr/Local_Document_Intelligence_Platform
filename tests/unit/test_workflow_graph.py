from typing import Any

from app.agents.graph import build_compare_graph, case_documents_from_extractions
from app.agents.state import CompareWorkflowState


class FakeServices:
    """In-memory CompareServices double."""

    def __init__(self, documents: list[dict[str, Any]], extractions: dict[str, Any]) -> None:
        self._documents = documents
        self._extractions = extractions
        self.created_reviews: list[dict[str, Any]] = []
        self.failed_ids: set[str] = set()

    async def load_documents(self, document_ids, case_id):
        return self._documents

    async def extract_document(self, document_id, document_type, text, *, force_reextract=False):
        if document_id in self.failed_ids:
            return None
        return self._extractions.get(document_id)

    async def create_review_tasks(self, workflow_run_id, case_id, discrepancies):
        self.created_reviews.extend(discrepancies)
        return [f"review-{i}" for i in range(len(discrepancies))]


def _document_pack() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    documents = [
        {
            "document_id": "d-contract",
            "filename": "service_contract.pdf",
            "document_type": "contract",
            "text": "contract text",
            "chunks": [
                {
                    "text": "Maximum aggregate fees: USD 75,000.00",
                    "page_number": 3,
                }
            ],
        },
        {
            "document_id": "d-invoice",
            "filename": "invoice_001.pdf",
            "document_type": "invoice",
            "text": "invoice text",
            "chunks": [
                {"text": "Invoice Number: INV-9\nTotal Due: USD 82,500.00", "page_number": 1}
            ],
        },
    ]
    extractions = {
        "d-contract": {
            "vendor_name": "Acme Analytics Ltd",
            "currency": "USD",
            "maximum_amount": 75000.0,
            "payment_terms": "Net 30",
            "effective_date": "2025-01-01",
            "expiration_date": "2026-01-01",
        },
        "d-invoice": {
            "invoice_number": "INV-9",
            "vendor_name": "Acme Analytics Ltd",
            "currency": "USD",
            "subtotal": 80000.0,
            "tax_rate_percent": 3.125,
            "tax": 2500.0,
            "total": 82500.0,
            "issue_date": "2025-06-01",
            "due_date": "2025-07-01",
            "payment_terms": "Net 30",
            "po_reference": "PO-1",
        },
    }
    return documents, extractions


async def test_graph_detects_discrepancy_and_creates_reviews() -> None:
    documents, extractions = _document_pack()
    services = FakeServices(documents, extractions)
    graph = build_compare_graph(services)

    state: CompareWorkflowState = await graph.ainvoke(
        {"workflow_run_id": "wf-1", "case_id": "case_x", "document_ids": [], "steps": []}
    )

    types = {d["type"] for d in state["discrepancies"]}
    assert "amount_exceeds_contract" in types
    assert state["requires_review"] is True
    assert len(state["review_task_ids"]) == len(state["discrepancies"])
    assert services.created_reviews == state["discrepancies"]
    amount_finding = next(
        finding
        for finding in state["discrepancies"]
        if finding["type"] == "amount_exceeds_contract"
    )
    assert {reference["page_number"] for reference in amount_finding["evidence"]} == {1, 3}
    assert state["report"]["issue_count"] == len(state["discrepancies"])
    assert "# Exception Report" in state["report_markdown"]
    step_names = [step["step"] for step in state["steps"]]
    assert step_names == [
        "load_documents",
        "extract_fields",
        "run_discrepancy_rules",
        "create_review_tasks",
        "generate_report",
    ]


async def test_graph_clean_case_skips_review_node() -> None:
    documents, extractions = _document_pack()
    extractions["d-invoice"].update({"subtotal": 50000.0, "tax": 0.0, "total": 50000.0})
    extractions["d-invoice"]["tax_rate_percent"] = 0.0
    services = FakeServices(documents, extractions)
    graph = build_compare_graph(services)

    state = await graph.ainvoke({"workflow_run_id": "wf-2", "document_ids": [], "steps": []})

    assert state["discrepancies"] == []
    assert state.get("review_task_ids", []) == []
    assert state["requires_review"] is False
    step_names = [step["step"] for step in state["steps"]]
    assert "create_review_tasks" not in step_names


async def test_extraction_failure_forces_review() -> None:
    documents, extractions = _document_pack()
    extractions["d-invoice"].update({"subtotal": 50000.0, "tax": 0.0, "total": 50000.0})
    extractions["d-invoice"]["tax_rate_percent"] = 0.0
    services = FakeServices(documents, extractions)
    services.failed_ids.add("d-contract")
    graph = build_compare_graph(services)

    state = await graph.ainvoke({"workflow_run_id": "wf-3", "document_ids": [], "steps": []})

    assert state["requires_review"] is True
    assert state["report"]["extraction_failures"]
    assert state["report"]["requires_human_review"] is True
    assert len(state["review_task_ids"]) == 1
    assert services.created_reviews[0]["type"] == "extraction_failure"


def test_case_documents_assembly_ignores_unknown_types() -> None:
    documents = {
        "a": {"document_type": "contract", "filename": "c.pdf"},
        "b": {"document_type": "other", "filename": "x.pdf"},
    }
    extractions = {"a": {"currency": "USD"}, "b": {"anything": 1}}
    case = case_documents_from_extractions(documents, extractions)
    assert case.contract is not None
    assert case.invoices == []
