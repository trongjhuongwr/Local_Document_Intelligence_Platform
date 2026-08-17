from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel

from app.extraction.schemas import (
    ContractExtraction,
    InvoiceExtraction,
    PolicyExtraction,
    PurchaseOrderExtraction,
)


class DiscrepancyKind(StrEnum):
    """Mirrors the DocFlowBench anomaly taxonomy 1:1 so evaluations map directly."""

    AMOUNT_EXCEEDS_CONTRACT = "amount_exceeds_contract"
    PO_MISMATCH = "po_mismatch"
    WRONG_CURRENCY = "wrong_currency"
    VENDOR_NAME_MISMATCH = "vendor_name_mismatch"
    DUPLICATE_INVOICE = "duplicate_invoice"
    INVOICE_DATE_OUTSIDE_CONTRACT = "invoice_date_outside_contract"
    INCONSISTENT_PAYMENT_TERMS = "inconsistent_payment_terms"
    MISSING_REQUIRED_FIELD = "missing_required_field"
    INCORRECT_TAX_CALCULATION = "incorrect_tax_calculation"
    INCORRECT_TOTAL = "incorrect_total"
    CONFLICTING_INVOICE_NUMBER = "conflicting_invoice_number"
    POLICY_VIOLATION = "policy_violation"


class DiscrepancySource(StrEnum):
    DETERMINISTIC_MISMATCH = "DETERMINISTIC_MISMATCH"
    MODEL_SUSPECTED_MISMATCH = "MODEL_SUSPECTED_MISMATCH"


class Severity(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Calculation(BaseModel):
    """Provenance for a numeric check: every operand and the formula used."""

    formula: str
    operands: dict[str, float]
    result: float


class Discrepancy(BaseModel):
    type: DiscrepancyKind
    source: DiscrepancySource
    severity: Severity
    description: str
    invoice_number: str | None = None
    field: str | None = None
    expected_value: float | str | None = None
    observed_value: float | str | None = None
    difference: float | None = None
    calculation: Calculation | None = None
    confidence: float = 1.0


class InvoiceRecord(BaseModel):
    """An extracted invoice plus the identity of its source document."""

    extraction: InvoiceExtraction
    filename: str | None = None
    document_id: UUID | None = None


class CaseDocuments(BaseModel):
    """The document pack a discrepancy analysis runs over."""

    contract: ContractExtraction | None = None
    purchase_order: PurchaseOrderExtraction | None = None
    invoices: list[InvoiceRecord] = []
    policy: PolicyExtraction | None = None


class DiscrepancyReport(BaseModel):
    discrepancies: list[Discrepancy]
    requires_human_review: bool
    checks_run: int
    documents_analyzed: int
