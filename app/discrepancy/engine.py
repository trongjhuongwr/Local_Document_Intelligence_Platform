"""Deterministic cross-document discrepancy engine.

Every rule here is plain Python over normalised extracted values — the LLM is
never involved in deciding whether numbers or fields disagree. Each numeric
finding carries a Calculation with its formula and operands as provenance.

Rule hierarchy: when an invoice exceeds the contract maximum, the PO check for
that invoice is suppressed — "exceeds contract" is the root cause and already
implies exceeding the (smaller) PO budget. Findings therefore map 1:1 to the
DocFlowBench anomaly taxonomy.
"""

from collections import defaultdict

from app.discrepancy.models import (
    Calculation,
    CaseDocuments,
    Discrepancy,
    DiscrepancyKind,
    DiscrepancyReport,
    DiscrepancySource,
    InvoiceRecord,
    Severity,
)
from app.discrepancy.normalize import (
    normalize_company_name,
    normalize_currency,
    normalize_payment_terms,
)

MONEY_TOLERANCE = 0.02
TAX_TOLERANCE = 0.03

_REQUIRED_INVOICE_FIELDS = ("invoice_number", "issue_date", "due_date", "total")


def _deterministic(
    kind: DiscrepancyKind,
    severity: Severity,
    description: str,
    **kwargs: object,
) -> Discrepancy:
    return Discrepancy(
        type=kind,
        source=DiscrepancySource.DETERMINISTIC_MISMATCH,
        severity=severity,
        description=description,
        confidence=1.0,
        **kwargs,  # type: ignore[arg-type]
    )


def _check_contract_limit(record: InvoiceRecord, case: CaseDocuments) -> Discrepancy | None:
    invoice = record.extraction
    if case.contract is None or case.contract.maximum_amount is None or invoice.total is None:
        return None
    limit = case.contract.maximum_amount
    if invoice.total <= limit + MONEY_TOLERANCE:
        return None
    difference = round(invoice.total - limit, 2)
    return _deterministic(
        DiscrepancyKind.AMOUNT_EXCEEDS_CONTRACT,
        Severity.HIGH,
        f"Invoice {invoice.invoice_number or record.filename} total {invoice.total:,.2f} "
        f"exceeds the contract maximum {limit:,.2f} by {difference:,.2f}",
        invoice_number=invoice.invoice_number,
        field="total",
        expected_value=limit,
        observed_value=invoice.total,
        difference=difference,
        calculation=Calculation(
            formula="invoice_total - contract_maximum_amount",
            operands={"invoice_total": invoice.total, "contract_maximum_amount": limit},
            result=difference,
        ),
    )


def _check_po_amount(record: InvoiceRecord, case: CaseDocuments) -> Discrepancy | None:
    invoice = record.extraction
    if (
        case.purchase_order is None
        or case.purchase_order.approved_amount is None
        or invoice.total is None
    ):
        return None
    approved = case.purchase_order.approved_amount
    if invoice.total <= approved + MONEY_TOLERANCE:
        return None
    difference = round(invoice.total - approved, 2)
    return _deterministic(
        DiscrepancyKind.PO_MISMATCH,
        Severity.HIGH,
        f"Invoice {invoice.invoice_number or record.filename} total {invoice.total:,.2f} "
        f"exceeds the approved purchase order amount {approved:,.2f} by {difference:,.2f}",
        invoice_number=invoice.invoice_number,
        field="total",
        expected_value=approved,
        observed_value=invoice.total,
        difference=difference,
        calculation=Calculation(
            formula="invoice_total - po_approved_amount",
            operands={"invoice_total": invoice.total, "po_approved_amount": approved},
            result=difference,
        ),
    )


def _check_currency(record: InvoiceRecord, case: CaseDocuments) -> Discrepancy | None:
    invoice = record.extraction
    if case.contract is None:
        return None
    invoice_currency = normalize_currency(invoice.currency)
    contract_currency = normalize_currency(case.contract.currency)
    if invoice_currency is None or contract_currency is None:
        return None
    if invoice_currency == contract_currency:
        return None
    return _deterministic(
        DiscrepancyKind.WRONG_CURRENCY,
        Severity.HIGH,
        f"Invoice {invoice.invoice_number or record.filename} is issued in "
        f"{invoice_currency} while the contract specifies {contract_currency}",
        invoice_number=invoice.invoice_number,
        field="currency",
        expected_value=contract_currency,
        observed_value=invoice_currency,
    )


def _check_vendor(record: InvoiceRecord, case: CaseDocuments) -> Discrepancy | None:
    invoice = record.extraction
    invoice_vendor = normalize_company_name(invoice.vendor_name)
    if invoice_vendor is None:
        return None
    references = [
        ref
        for ref in (
            normalize_company_name(case.contract.vendor_name) if case.contract else None,
            normalize_company_name(case.purchase_order.vendor_name)
            if case.purchase_order
            else None,
        )
        if ref is not None
    ]
    if not references or any(invoice_vendor == ref for ref in references):
        return None
    return _deterministic(
        DiscrepancyKind.VENDOR_NAME_MISMATCH,
        Severity.MEDIUM,
        f"Invoice {invoice.invoice_number or record.filename} vendor "
        f"'{invoice.vendor_name}' does not match the contracted vendor",
        invoice_number=invoice.invoice_number,
        field="vendor_name",
        expected_value=(case.contract.vendor_name if case.contract else None)
        or (case.purchase_order.vendor_name if case.purchase_order else None),
        observed_value=invoice.vendor_name,
    )


def _check_dates(record: InvoiceRecord, case: CaseDocuments) -> Discrepancy | None:
    invoice = record.extraction
    if case.contract is None or invoice.issue_date is None:
        return None
    effective = case.contract.effective_date
    expiration = case.contract.expiration_date
    if expiration is not None and invoice.issue_date > expiration:
        days_over = (invoice.issue_date - expiration).days
        return _deterministic(
            DiscrepancyKind.INVOICE_DATE_OUTSIDE_CONTRACT,
            Severity.MEDIUM,
            f"Invoice {invoice.invoice_number or record.filename} issue date "
            f"{invoice.issue_date} falls {days_over} days after the contract "
            f"expiration {expiration}",
            invoice_number=invoice.invoice_number,
            field="issue_date",
            expected_value=str(expiration),
            observed_value=str(invoice.issue_date),
            difference=float(days_over),
            calculation=Calculation(
                formula="invoice_issue_date - contract_expiration_date (days)",
                operands={},
                result=float(days_over),
            ),
        )
    if effective is not None and invoice.issue_date < effective:
        days_before = (effective - invoice.issue_date).days
        return _deterministic(
            DiscrepancyKind.INVOICE_DATE_OUTSIDE_CONTRACT,
            Severity.MEDIUM,
            f"Invoice {invoice.invoice_number or record.filename} issue date "
            f"{invoice.issue_date} falls {days_before} days before the contract "
            f"effective date {effective}",
            invoice_number=invoice.invoice_number,
            field="issue_date",
            expected_value=str(effective),
            observed_value=str(invoice.issue_date),
            difference=float(days_before),
        )
    return None


def _check_payment_terms(record: InvoiceRecord, case: CaseDocuments) -> Discrepancy | None:
    invoice = record.extraction
    if case.contract is None:
        return None
    invoice_terms = normalize_payment_terms(invoice.payment_terms)
    contract_terms = normalize_payment_terms(case.contract.payment_terms)
    if invoice_terms is None or contract_terms is None or invoice_terms == contract_terms:
        return None
    return _deterministic(
        DiscrepancyKind.INCONSISTENT_PAYMENT_TERMS,
        Severity.MEDIUM,
        f"Invoice {invoice.invoice_number or record.filename} payment terms "
        f"'{invoice_terms}' differ from the contract terms '{contract_terms}'",
        invoice_number=invoice.invoice_number,
        field="payment_terms",
        expected_value=contract_terms,
        observed_value=invoice_terms,
    )


def _check_totals(record: InvoiceRecord) -> Discrepancy | None:
    invoice = record.extraction
    if invoice.subtotal is None or invoice.tax is None or invoice.total is None:
        return None
    computed = round(invoice.subtotal + invoice.tax, 2)
    if abs(computed - invoice.total) <= MONEY_TOLERANCE:
        return None
    difference = round(computed - invoice.total, 2)
    return _deterministic(
        DiscrepancyKind.INCORRECT_TOTAL,
        Severity.HIGH,
        f"Invoice {invoice.invoice_number or record.filename} states total "
        f"{invoice.total:,.2f} but subtotal + tax = {computed:,.2f}",
        invoice_number=invoice.invoice_number,
        field="total",
        expected_value=computed,
        observed_value=invoice.total,
        difference=difference,
        calculation=Calculation(
            formula="(subtotal + tax) - stated_total",
            operands={
                "subtotal": invoice.subtotal,
                "tax": invoice.tax,
                "stated_total": invoice.total,
            },
            result=difference,
        ),
    )


def _check_tax(record: InvoiceRecord) -> Discrepancy | None:
    invoice = record.extraction
    if invoice.subtotal is None or invoice.tax is None or invoice.tax_rate_percent is None:
        return None
    expected_tax = round(invoice.subtotal * invoice.tax_rate_percent / 100, 2)
    if abs(expected_tax - invoice.tax) <= TAX_TOLERANCE:
        return None
    difference = round(expected_tax - invoice.tax, 2)
    return _deterministic(
        DiscrepancyKind.INCORRECT_TAX_CALCULATION,
        Severity.MEDIUM,
        f"Invoice {invoice.invoice_number or record.filename} states tax "
        f"{invoice.tax:,.2f} but {invoice.tax_rate_percent:g}% of the subtotal is "
        f"{expected_tax:,.2f}",
        invoice_number=invoice.invoice_number,
        field="tax",
        expected_value=expected_tax,
        observed_value=invoice.tax,
        difference=difference,
        calculation=Calculation(
            formula="subtotal * tax_rate / 100 - stated_tax",
            operands={
                "subtotal": invoice.subtotal,
                "tax_rate_percent": invoice.tax_rate_percent,
                "stated_tax": invoice.tax,
            },
            result=difference,
        ),
    )


def _check_missing_fields(record: InvoiceRecord) -> list[Discrepancy]:
    invoice = record.extraction
    findings = []
    for field in _REQUIRED_INVOICE_FIELDS:
        if getattr(invoice, field) is None:
            findings.append(
                _deterministic(
                    DiscrepancyKind.MISSING_REQUIRED_FIELD,
                    Severity.LOW,
                    f"Invoice {invoice.invoice_number or record.filename} omits the "
                    f"required field '{field}'",
                    invoice_number=invoice.invoice_number,
                    field=field,
                )
            )
    return findings


def _check_policy(record: InvoiceRecord, case: CaseDocuments) -> Discrepancy | None:
    invoice = record.extraction
    if case.policy is None or case.policy.po_reference_required is not True:
        return None
    if invoice.po_reference is not None:
        return None
    return _deterministic(
        DiscrepancyKind.POLICY_VIOLATION,
        Severity.MEDIUM,
        f"Invoice {invoice.invoice_number or record.filename} does not reference a "
        "purchase order although the payment policy requires one",
        invoice_number=invoice.invoice_number,
        field="po_reference",
    )


def _check_duplicates(invoices: list[InvoiceRecord]) -> list[Discrepancy]:
    findings: list[Discrepancy] = []
    by_number: dict[str, list[InvoiceRecord]] = defaultdict(list)
    for record in invoices:
        if record.extraction.invoice_number is not None:
            by_number[record.extraction.invoice_number].append(record)
    for number, records in by_number.items():
        if len(records) < 2:
            continue
        totals = [r.extraction.total for r in records]
        if all(t is not None for t in totals) and len({round(t, 2) for t in totals if t}) > 1:
            findings.append(
                _deterministic(
                    DiscrepancyKind.CONFLICTING_INVOICE_NUMBER,
                    Severity.HIGH,
                    f"{len(records)} invoices share the number {number} but state "
                    f"different totals ({', '.join(f'{t:,.2f}' for t in totals if t)})",
                    invoice_number=number,
                    field="invoice_number",
                )
            )
        else:
            findings.append(
                _deterministic(
                    DiscrepancyKind.DUPLICATE_INVOICE,
                    Severity.HIGH,
                    f"Invoice {number} appears {len(records)} times with identical totals",
                    invoice_number=number,
                    field="invoice_number",
                )
            )
    return findings


def analyze_case(case: CaseDocuments) -> DiscrepancyReport:
    """Run every deterministic rule over the document pack."""
    discrepancies: list[Discrepancy] = []
    checks_run = 0

    for record in case.invoices:
        contract_finding = _check_contract_limit(record, case)
        checks_run += 1
        if contract_finding is not None:
            discrepancies.append(contract_finding)
        else:
            # Only check the PO budget when the contract cap is respected —
            # exceeding the contract already implies exceeding the smaller PO.
            po_finding = _check_po_amount(record, case)
            checks_run += 1
            if po_finding is not None:
                discrepancies.append(po_finding)

        for check in (_check_currency, _check_vendor, _check_dates, _check_payment_terms):
            finding = check(record, case)
            checks_run += 1
            if finding is not None:
                discrepancies.append(finding)

        for invoice_check in (_check_totals, _check_tax):
            finding = invoice_check(record)
            checks_run += 1
            if finding is not None:
                discrepancies.append(finding)

        discrepancies.extend(_check_missing_fields(record))
        checks_run += 1

        policy_finding = _check_policy(record, case)
        checks_run += 1
        if policy_finding is not None:
            discrepancies.append(policy_finding)

    discrepancies.extend(_check_duplicates(case.invoices))
    checks_run += 1

    documents = sum(
        1 for doc in (case.contract, case.purchase_order, case.policy) if doc is not None
    ) + len(case.invoices)

    requires_review = any(d.severity == Severity.HIGH for d in discrepancies)

    return DiscrepancyReport(
        discrepancies=discrepancies,
        requires_human_review=requires_review,
        checks_run=checks_run,
        documents_analyzed=documents,
    )
