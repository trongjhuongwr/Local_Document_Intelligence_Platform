import pytest

from app.agents.tools import (
    TOOL_REGISTRY,
    ToolExecutionError,
    run_tool,
)
from app.discrepancy.engine import analyze_case
from app.discrepancy.models import CaseDocuments, InvoiceRecord
from app.extraction.schemas import ContractExtraction, InvoiceExtraction
from app.workflows.report import build_exception_report, report_to_markdown


def test_calculate_difference_tool() -> None:
    result = run_tool(
        "calculate_difference", {"minuend": 82500, "subtrahend": 75000, "label": "overbilling"}
    )
    assert result.difference == 7500.0
    assert result.percentage_of_subtrahend == 10.0
    assert result.formula == "82500.0 - 75000.0"


def test_validate_totals_tool() -> None:
    ok = run_tool("validate_totals", {"subtotal": 1000, "tax": 100, "stated_total": 1100})
    assert ok.valid is True
    bad = run_tool("validate_totals", {"subtotal": 1000, "tax": 100, "stated_total": 1250})
    assert bad.valid is False
    assert bad.difference == -150.0


def test_detect_duplicate_invoice_tool() -> None:
    result = run_tool(
        "detect_duplicate_invoice",
        {
            "invoices": [
                {"invoice_number": "INV-1", "total": 100.0},
                {"invoice_number": "INV-1", "total": 100.0},
                {"invoice_number": "INV-2", "total": 50.0},
            ]
        },
    )
    assert len(result.duplicates) == 1
    assert result.duplicates[0].identical_totals is True


def test_unknown_tool_rejected() -> None:
    with pytest.raises(ToolExecutionError) as excinfo:
        run_tool("run_sql", {"query": "DROP TABLE documents"})
    assert "allowed_tools" in excinfo.value.details


def test_invalid_input_rejected_with_structured_errors() -> None:
    with pytest.raises(ToolExecutionError) as excinfo:
        run_tool("calculate_difference", {"minuend": "not-a-number"})
    assert "validation_errors" in excinfo.value.details


def test_registry_tools_have_contracts() -> None:
    for name, spec in TOOL_REGISTRY.items():
        assert spec.name == name
        assert spec.purpose
        assert spec.input_schema.model_json_schema()
        assert spec.output_schema.model_json_schema()


def _sample_engine_report():
    contract = ContractExtraction(currency="USD", maximum_amount=75000.0, payment_terms="Net 30")
    invoice = InvoiceExtraction(
        invoice_number="INV-9",
        currency="USD",
        subtotal=80000.0,
        tax=2500.0,
        tax_rate_percent=3.125,
        total=82500.0,
        issue_date="2025-06-01",
        due_date="2025-07-01",
        payment_terms="Net 30",
        po_reference="PO-1",
    )
    case = CaseDocuments(
        contract=contract,
        invoices=[InvoiceRecord(extraction=invoice, filename="invoice_001.pdf")],
    )
    return analyze_case(case)


def test_exception_report_structure_and_markdown() -> None:
    engine_report = _sample_engine_report()
    report = build_exception_report(
        engine_report,
        case_id="case_042",
        documents=[{"document_id": "x", "filename": "invoice_001.pdf", "document_type": "invoice"}],
    )
    assert report["issue_count"] >= 1
    assert report["deterministic_issue_count"] == report["issue_count"]
    assert report["requires_human_review"] is True
    issue = report["issues"][0]
    assert issue["type"] == "amount_exceeds_contract"
    assert issue["difference"] == pytest.approx(7500.0)
    assert issue["calculation"]["formula"] == "invoice_total - contract_maximum_amount"
    assert report["limitations"]

    markdown = report_to_markdown(report)
    assert "# Exception Report" in markdown
    assert "amount_exceeds_contract" in markdown
    assert "Requires human review:** yes" in markdown
