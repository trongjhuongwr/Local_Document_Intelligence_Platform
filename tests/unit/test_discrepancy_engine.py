from datetime import date

import pytest

from app.discrepancy.engine import analyze_case
from app.discrepancy.models import (
    CaseDocuments,
    DiscrepancyKind,
    DiscrepancySource,
    InvoiceRecord,
)
from app.discrepancy.normalize import (
    normalize_company_name,
    normalize_currency,
    normalize_payment_terms,
)
from app.extraction.schemas import (
    ContractExtraction,
    InvoiceExtraction,
    PolicyExtraction,
    PurchaseOrderExtraction,
)
from synthetic_data.generator.builder import build_case
from synthetic_data.generator.models import BenchmarkCase


def _invoice(**overrides: object) -> InvoiceExtraction:
    base: dict[str, object] = {
        "invoice_number": "INV-2025-11111",
        "vendor_name": "Acme Analytics Ltd",
        "customer_name": "Vertex Retail Corporation",
        "issue_date": date(2025, 6, 1),
        "due_date": date(2025, 7, 1),
        "currency": "USD",
        "subtotal": 1000.0,
        "tax_rate_percent": 10.0,
        "tax": 100.0,
        "total": 1100.0,
        "payment_terms": "Net 30",
        "po_reference": "PO-2025-1234",
    }
    base.update(overrides)
    return InvoiceExtraction.model_validate(base)


def _case(invoice: InvoiceExtraction, **overrides: object) -> CaseDocuments:
    contract = ContractExtraction(
        vendor_name="Acme Analytics Ltd",
        customer_name="Vertex Retail Corporation",
        effective_date=date(2025, 1, 1),
        expiration_date=date(2026, 1, 1),
        currency="USD",
        maximum_amount=75000.0,
        payment_terms="Net 30",
    )
    po = PurchaseOrderExtraction(
        po_number="PO-2025-1234",
        vendor_name="Acme Analytics Ltd",
        issue_date=date(2025, 5, 1),
        currency="USD",
        approved_amount=50000.0,
    )
    policy = PolicyExtraction(
        required_payment_terms="Net 30",
        po_reference_required=True,
        manual_approval_threshold=10000.0,
        currency="USD",
    )
    fields: dict[str, object] = {
        "contract": contract,
        "purchase_order": po,
        "policy": policy,
        "invoices": [InvoiceRecord(extraction=invoice, filename="invoice_001.pdf")],
    }
    fields.update(overrides)
    return CaseDocuments.model_validate(fields)


def _kinds(case: CaseDocuments) -> set[DiscrepancyKind]:
    return {d.type for d in analyze_case(case).discrepancies}


def test_clean_invoice_produces_no_findings() -> None:
    report = analyze_case(_case(_invoice()))
    assert report.discrepancies == []
    assert report.requires_human_review is False


def test_amount_exceeding_contract_suppresses_po_check() -> None:
    invoice = _invoice(subtotal=80000.0, tax=2500.0, total=82500.0, tax_rate_percent=3.125)
    report = analyze_case(_case(invoice))
    kinds = {d.type for d in report.discrepancies}
    assert DiscrepancyKind.AMOUNT_EXCEEDS_CONTRACT in kinds
    assert DiscrepancyKind.PO_MISMATCH not in kinds
    finding = next(
        d for d in report.discrepancies if d.type == DiscrepancyKind.AMOUNT_EXCEEDS_CONTRACT
    )
    assert finding.difference == pytest.approx(7500.0)
    assert finding.source == DiscrepancySource.DETERMINISTIC_MISMATCH
    assert finding.calculation is not None
    assert finding.calculation.operands["contract_maximum_amount"] == 75000.0
    assert report.requires_human_review is True


def test_po_exceeded_but_contract_respected() -> None:
    invoice = _invoice(subtotal=54000.0, tax=1000.0, total=55000.0, tax_rate_percent=1.85185185)
    kinds = _kinds(_case(invoice))
    assert DiscrepancyKind.PO_MISMATCH in kinds
    assert DiscrepancyKind.AMOUNT_EXCEEDS_CONTRACT not in kinds


def test_incorrect_total_detected() -> None:
    invoice = _invoice(total=1250.0)
    findings = analyze_case(_case(invoice)).discrepancies
    finding = next(d for d in findings if d.type == DiscrepancyKind.INCORRECT_TOTAL)
    assert finding.difference == pytest.approx(-150.0)


def test_incorrect_tax_detected() -> None:
    invoice = _invoice(tax=50.0, total=1050.0)
    kinds = _kinds(_case(invoice))
    assert DiscrepancyKind.INCORRECT_TAX_CALCULATION in kinds
    assert DiscrepancyKind.INCORRECT_TOTAL not in kinds


def test_missing_documents_do_not_crash() -> None:
    case = CaseDocuments(invoices=[InvoiceRecord(extraction=_invoice())])
    report = analyze_case(case)
    assert report.documents_analyzed == 1
    assert DiscrepancyKind.AMOUNT_EXCEEDS_CONTRACT not in {d.type for d in report.discrepancies}


def test_policy_violation_requires_policy_flag() -> None:
    invoice = _invoice(po_reference=None)
    assert DiscrepancyKind.POLICY_VIOLATION in _kinds(_case(invoice))
    relaxed_policy = PolicyExtraction(po_reference_required=False)
    assert DiscrepancyKind.POLICY_VIOLATION not in _kinds(_case(invoice, policy=relaxed_policy))


def test_normalizers() -> None:
    assert normalize_company_name("Acme Analytics Ltd.") == "acme analytics"
    assert normalize_company_name("ACME ANALYTICS") == "acme analytics"
    assert normalize_company_name(None) is None
    assert normalize_currency("$") == "USD"
    assert normalize_currency(" usd ") == "USD"
    assert normalize_payment_terms("NET30") == "Net 30"
    assert normalize_payment_terms("net 30 days") == "Net 30"
    assert normalize_payment_terms(None) is None


def _perfect_extraction(case: BenchmarkCase) -> CaseDocuments:
    """Simulate a perfect extractor by copying ground truth into extraction schemas."""
    contract = ContractExtraction(
        vendor_name=case.contract.vendor_name,
        customer_name=case.contract.customer_name,
        effective_date=case.contract.effective_date,
        expiration_date=case.contract.expiration_date,
        currency=case.contract.currency,
        maximum_amount=case.contract.maximum_amount,
        payment_terms=case.contract.payment_terms,
        obligations=case.contract.obligations,
    )
    po = PurchaseOrderExtraction(
        po_number=case.purchase_order.po_number,
        vendor_name=case.purchase_order.vendor_name,
        customer_name=case.purchase_order.customer_name,
        issue_date=case.purchase_order.issue_date,
        currency=case.purchase_order.currency,
        approved_amount=case.purchase_order.approved_amount,
    )
    policy = PolicyExtraction(
        required_payment_terms=case.policy.required_payment_terms,
        po_reference_required=case.policy.po_reference_required,
        manual_approval_threshold=case.policy.manual_approval_threshold,
        currency=case.policy.currency,
    )
    invoices = [
        InvoiceRecord(
            extraction=InvoiceExtraction(
                invoice_number=invoice.invoice_number,
                vendor_name=invoice.vendor_name,
                customer_name=invoice.customer_name,
                issue_date=invoice.issue_date,
                due_date=invoice.due_date,
                currency=invoice.currency,
                subtotal=invoice.subtotal,
                tax_rate_percent=invoice.tax_rate_percent,
                tax=invoice.tax,
                total=invoice.total,
                payment_terms=invoice.payment_terms,
                po_reference=invoice.po_reference,
            ),
            filename=invoice.filename,
        )
        for invoice in case.invoices
    ]
    return CaseDocuments(contract=contract, purchase_order=po, policy=policy, invoices=invoices)


@pytest.mark.parametrize("index", range(1, 41))
def test_engine_agrees_with_benchmark_ground_truth(index: int) -> None:
    """With perfect extraction, the deterministic rules must reproduce the
    benchmark's expected anomalies exactly — no misses, no false positives."""
    case = build_case(seed=123, index=index)
    report = analyze_case(_perfect_extraction(case))
    found = {(d.type.value, d.invoice_number) for d in report.discrepancies}
    expected = {(a.type.value, a.invoice_number) for a in case.expected_anomalies}
    assert found == expected, (
        f"{case.case_id}: engine found {sorted(found)} but ground truth expects {sorted(expected)}"
    )
