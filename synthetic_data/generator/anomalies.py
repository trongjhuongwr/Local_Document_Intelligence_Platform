"""Anomaly selection and injection for DocFlowBench cases.

Each injector mutates the case documents so that the anomaly is genuinely
present in the rendered PDFs, and returns the corresponding ground-truth
record. Injection order is canonicalised so results are deterministic.
"""

import random
from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from synthetic_data.generator.models import (
    AnomalyType,
    ExpectedAnomaly,
    InvoiceTruth,
    LineItem,
)

if TYPE_CHECKING:
    from synthetic_data.generator.models import BenchmarkCase

_NUMERIC = {
    AnomalyType.AMOUNT_EXCEEDS_CONTRACT,
    AnomalyType.PO_MISMATCH,
    AnomalyType.INCORRECT_TAX_CALCULATION,
    AnomalyType.INCORRECT_TOTAL,
}
_ALL = set(AnomalyType)

# Types that may not be combined in one case. Numeric mutations all rewrite the
# invoice totals, so they are mutually exclusive; second-invoice anomalies must
# clone/derive from a clean first invoice, so they always occur alone.
CONFLICTS: dict[AnomalyType, set[AnomalyType]] = {
    AnomalyType.AMOUNT_EXCEEDS_CONTRACT: _NUMERIC,
    AnomalyType.PO_MISMATCH: _NUMERIC,
    AnomalyType.INCORRECT_TAX_CALCULATION: _NUMERIC,
    AnomalyType.INCORRECT_TOTAL: _NUMERIC,
    AnomalyType.DUPLICATE_INVOICE: _ALL,
    AnomalyType.CONFLICTING_INVOICE_NUMBER: _ALL,
}

_PAYMENT_TERMS_DAYS = {"Net 15": 15, "Net 30": 30, "Net 45": 45, "Net 60": 60}
_CURRENCIES = ["USD", "EUR", "GBP"]


def select_anomaly_types(rng: random.Random) -> list[AnomalyType]:
    """~30% clean cases, ~55% single anomaly, ~15% two compatible anomalies."""
    roll = rng.random()
    if roll < 0.30:
        return []
    count = 1 if roll < 0.85 else 2
    pool = list(AnomalyType)
    rng.shuffle(pool)
    chosen: list[AnomalyType] = []
    for candidate in pool:
        if len(chosen) == count:
            break
        conflict = any(
            candidate in CONFLICTS.get(existing, set())
            or existing in CONFLICTS.get(candidate, set())
            for existing in chosen
        )
        if not conflict:
            chosen.append(candidate)
    # Canonical order keeps injection deterministic regardless of shuffle order.
    order = list(AnomalyType)
    return sorted(chosen, key=order.index)


def _money(value: Decimal) -> Decimal:
    from synthetic_data.generator.builder import money

    return money(value)


def _dec(value: float) -> Decimal:
    return Decimal(str(value))


def _rewrite_invoice_totals(invoice: InvoiceTruth, new_total: Decimal) -> None:
    """Rebuild subtotal/tax/line items so the printed invoice sums to new_total."""
    rate = _dec(invoice.tax_rate_percent)
    subtotal = _money(new_total / (1 + rate / 100))
    tax = _money(new_total - subtotal)
    invoice.subtotal = float(subtotal)
    invoice.tax = float(tax)
    invoice.total = float(_money(new_total))
    invoice.line_items = [
        LineItem(
            description="Expanded service scope and additional deliverables",
            quantity=1,
            unit_price=float(subtotal),
            amount=float(subtotal),
        )
    ]


def inject_anomalies(
    case: "BenchmarkCase", types: list[AnomalyType], rng: random.Random
) -> list[ExpectedAnomaly]:
    anomalies: list[ExpectedAnomaly] = []
    for anomaly_type in types:
        injector = _INJECTORS[anomaly_type]
        anomalies.append(injector(case, rng))
    return anomalies


def _inject_amount_exceeds_contract(case: "BenchmarkCase", rng: random.Random) -> ExpectedAnomaly:
    invoice = case.invoices[0]
    limit = _dec(case.contract.maximum_amount)
    new_total = _money(limit * (1 + Decimal(rng.randint(5, 30)) / 100))
    _rewrite_invoice_totals(invoice, new_total)
    difference = float(_money(new_total - limit))
    return ExpectedAnomaly(
        type=AnomalyType.AMOUNT_EXCEEDS_CONTRACT,
        invoice_number=invoice.invoice_number,
        expected_difference=difference,
        description=(
            f"Invoice total {invoice.total:.2f} exceeds the contract maximum "
            f"{case.contract.maximum_amount:.2f} by {difference:.2f}"
        ),
    )


def _inject_po_mismatch(case: "BenchmarkCase", rng: random.Random) -> ExpectedAnomaly:
    invoice = case.invoices[0]
    po_amount = _dec(case.purchase_order.approved_amount)
    limit = _dec(case.contract.maximum_amount)
    max_pct = min(25, int((limit / po_amount - 1) * 100) - 2)
    pct = rng.randint(5, max(5, max_pct))
    new_total = _money(po_amount * (1 + Decimal(pct) / 100))
    _rewrite_invoice_totals(invoice, new_total)
    difference = float(_money(new_total - po_amount))
    return ExpectedAnomaly(
        type=AnomalyType.PO_MISMATCH,
        invoice_number=invoice.invoice_number,
        expected_difference=difference,
        description=(
            f"Invoice total {invoice.total:.2f} exceeds the approved purchase order "
            f"amount {case.purchase_order.approved_amount:.2f} by {difference:.2f}"
        ),
    )


def _inject_wrong_currency(case: "BenchmarkCase", rng: random.Random) -> ExpectedAnomaly:
    invoice = case.invoices[0]
    invoice.currency = rng.choice([c for c in _CURRENCIES if c != case.contract.currency])
    return ExpectedAnomaly(
        type=AnomalyType.WRONG_CURRENCY,
        invoice_number=invoice.invoice_number,
        field="currency",
        description=(
            f"Invoice is issued in {invoice.currency} while the contract "
            f"specifies {case.contract.currency}"
        ),
    )


def _inject_vendor_name_mismatch(case: "BenchmarkCase", rng: random.Random) -> ExpectedAnomaly:
    from synthetic_data.generator.builder import VENDORS

    invoice = case.invoices[0]
    invoice.vendor_name = rng.choice([v for v in VENDORS if v != case.vendor])
    return ExpectedAnomaly(
        type=AnomalyType.VENDOR_NAME_MISMATCH,
        invoice_number=invoice.invoice_number,
        field="vendor_name",
        description=(
            f"Invoice vendor '{invoice.vendor_name}' does not match the contracted "
            f"vendor '{case.vendor}'"
        ),
    )


def _inject_duplicate_invoice(case: "BenchmarkCase", rng: random.Random) -> ExpectedAnomaly:
    original = case.invoices[0]
    duplicate = original.model_copy(deep=True)
    duplicate.filename = "invoice_002.pdf"
    case.invoices.append(duplicate)
    return ExpectedAnomaly(
        type=AnomalyType.DUPLICATE_INVOICE,
        invoice_number=original.invoice_number,
        description=(
            f"Invoice {original.invoice_number} was submitted twice with identical "
            f"amounts ({original.total:.2f})"
        ),
    )


def _inject_invoice_date_outside_contract(
    case: "BenchmarkCase", rng: random.Random
) -> ExpectedAnomaly:
    invoice = case.invoices[0]
    days_over = rng.randint(10, 90)
    invoice.issue_date = case.contract.expiration_date + timedelta(days=days_over)
    terms_days = _PAYMENT_TERMS_DAYS.get(invoice.payment_terms or "", 30)
    invoice.due_date = invoice.issue_date + timedelta(days=terms_days)
    return ExpectedAnomaly(
        type=AnomalyType.INVOICE_DATE_OUTSIDE_CONTRACT,
        invoice_number=invoice.invoice_number,
        field="issue_date",
        expected_difference=float(days_over),
        description=(
            f"Invoice issue date {invoice.issue_date} falls {days_over} days after "
            f"the contract expiration {case.contract.expiration_date}"
        ),
    )


def _inject_inconsistent_payment_terms(
    case: "BenchmarkCase", rng: random.Random
) -> ExpectedAnomaly:
    invoice = case.invoices[0]
    invoice.payment_terms = rng.choice(
        [t for t in _PAYMENT_TERMS_DAYS if t != case.contract.payment_terms]
    )
    if invoice.issue_date is not None:
        invoice.due_date = invoice.issue_date + timedelta(
            days=_PAYMENT_TERMS_DAYS[invoice.payment_terms]
        )
    return ExpectedAnomaly(
        type=AnomalyType.INCONSISTENT_PAYMENT_TERMS,
        invoice_number=invoice.invoice_number,
        field="payment_terms",
        description=(
            f"Invoice payment terms '{invoice.payment_terms}' differ from the "
            f"contract terms '{case.contract.payment_terms}'"
        ),
    )


def _inject_missing_required_field(case: "BenchmarkCase", rng: random.Random) -> ExpectedAnomaly:
    invoice = case.invoices[0]
    invoice.due_date = None
    return ExpectedAnomaly(
        type=AnomalyType.MISSING_REQUIRED_FIELD,
        invoice_number=invoice.invoice_number,
        field="due_date",
        description="Invoice omits the required due date",
    )


def _inject_incorrect_tax(case: "BenchmarkCase", rng: random.Random) -> ExpectedAnomaly:
    invoice = case.invoices[0]
    rate = _dec(invoice.tax_rate_percent)
    if rate == 0:
        # A zero-rate invoice gains a stated 8% rate with an understated tax:
        # factors above 1 would grow the total past the PO's 8% safety margin
        # and leak an unintended po_mismatch into the ground truth.
        rate = Decimal("8")
        invoice.tax_rate_percent = 8.0
        factor = Decimal(rng.choice(["0.5", "0.75"]))
    else:
        factor = Decimal(rng.choice(["0.5", "0.75", "1.25", "1.5"]))
    subtotal = _dec(invoice.subtotal)
    correct_tax = _money(subtotal * rate / 100)
    wrong_tax = _money(correct_tax * factor)
    if wrong_tax == correct_tax:
        wrong_tax = _money(correct_tax + Decimal(10))
    invoice.tax = float(wrong_tax)
    invoice.total = float(_money(subtotal + wrong_tax))
    difference = float(_money(correct_tax - wrong_tax))
    return ExpectedAnomaly(
        type=AnomalyType.INCORRECT_TAX_CALCULATION,
        invoice_number=invoice.invoice_number,
        field="tax",
        expected_difference=difference,
        description=(
            f"Stated tax {invoice.tax:.2f} does not equal {rate}% of the subtotal "
            f"({float(correct_tax):.2f})"
        ),
    )


def _inject_incorrect_total(case: "BenchmarkCase", rng: random.Random) -> ExpectedAnomaly:
    invoice = case.invoices[0]
    correct_total = _money(_dec(invoice.subtotal) + _dec(invoice.tax))
    pct = Decimal(rng.randint(2, 6)) / 100
    sign = rng.choice([-1, 1])
    wrong_total = _money(correct_total * (1 + sign * pct))
    if wrong_total == correct_total:
        wrong_total = _money(correct_total + Decimal(25))
    invoice.total = float(wrong_total)
    difference = float(_money(correct_total - wrong_total))
    return ExpectedAnomaly(
        type=AnomalyType.INCORRECT_TOTAL,
        invoice_number=invoice.invoice_number,
        field="total",
        expected_difference=difference,
        description=(
            f"Stated total {invoice.total:.2f} does not equal subtotal plus tax "
            f"({float(correct_total):.2f})"
        ),
    )


def _inject_conflicting_invoice_number(
    case: "BenchmarkCase", rng: random.Random
) -> ExpectedAnomaly:
    original = case.invoices[0]
    rate = _dec(original.tax_rate_percent)
    subtotal = _money(_dec(original.subtotal) * Decimal(rng.randint(20, 50)) / 100)
    tax = _money(subtotal * rate / 100)
    total = _money(subtotal + tax)
    issue_date = (
        original.issue_date + timedelta(days=rng.randint(7, 30)) if original.issue_date else None
    )
    terms_days = _PAYMENT_TERMS_DAYS.get(original.payment_terms or "", 30)
    second = InvoiceTruth(
        invoice_number=original.invoice_number,
        vendor_name=original.vendor_name,
        customer_name=original.customer_name,
        issue_date=issue_date,
        due_date=issue_date + timedelta(days=terms_days) if issue_date else None,
        currency=original.currency,
        subtotal=float(subtotal),
        tax_rate_percent=original.tax_rate_percent,
        tax=float(tax),
        total=float(total),
        payment_terms=original.payment_terms,
        po_reference=original.po_reference,
        line_items=[
            LineItem(
                description="Supplemental services",
                quantity=1,
                unit_price=float(subtotal),
                amount=float(subtotal),
            )
        ],
        filename="invoice_002.pdf",
    )
    case.invoices.append(second)
    return ExpectedAnomaly(
        type=AnomalyType.CONFLICTING_INVOICE_NUMBER,
        invoice_number=original.invoice_number,
        field="invoice_number",
        description=(
            f"Two invoices share the number {original.invoice_number} but state "
            f"different totals ({original.total:.2f} vs {float(total):.2f})"
        ),
    )


def _inject_policy_violation(case: "BenchmarkCase", rng: random.Random) -> ExpectedAnomaly:
    invoice = case.invoices[0]
    invoice.po_reference = None
    return ExpectedAnomaly(
        type=AnomalyType.POLICY_VIOLATION,
        invoice_number=invoice.invoice_number,
        field="po_reference",
        description=(
            "Invoice does not reference a purchase order although the payment policy requires one"
        ),
    )


_INJECTORS = {
    AnomalyType.AMOUNT_EXCEEDS_CONTRACT: _inject_amount_exceeds_contract,
    AnomalyType.PO_MISMATCH: _inject_po_mismatch,
    AnomalyType.WRONG_CURRENCY: _inject_wrong_currency,
    AnomalyType.VENDOR_NAME_MISMATCH: _inject_vendor_name_mismatch,
    AnomalyType.DUPLICATE_INVOICE: _inject_duplicate_invoice,
    AnomalyType.INVOICE_DATE_OUTSIDE_CONTRACT: _inject_invoice_date_outside_contract,
    AnomalyType.INCONSISTENT_PAYMENT_TERMS: _inject_inconsistent_payment_terms,
    AnomalyType.MISSING_REQUIRED_FIELD: _inject_missing_required_field,
    AnomalyType.INCORRECT_TAX_CALCULATION: _inject_incorrect_tax,
    AnomalyType.INCORRECT_TOTAL: _inject_incorrect_total,
    AnomalyType.CONFLICTING_INVOICE_NUMBER: _inject_conflicting_invoice_number,
    AnomalyType.POLICY_VIOLATION: _inject_policy_violation,
}
