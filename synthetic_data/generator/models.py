from datetime import date
from enum import StrEnum

from pydantic import BaseModel


class AnomalyType(StrEnum):
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


class LineItem(BaseModel):
    description: str
    quantity: int
    unit_price: float
    amount: float


class ContractTruth(BaseModel):
    vendor_name: str
    customer_name: str
    effective_date: date
    expiration_date: date
    currency: str
    maximum_amount: float
    payment_terms: str
    obligations: list[str]


class PurchaseOrderTruth(BaseModel):
    po_number: str
    vendor_name: str
    customer_name: str
    issue_date: date
    currency: str
    approved_amount: float


class InvoiceTruth(BaseModel):
    invoice_number: str
    vendor_name: str
    customer_name: str
    issue_date: date | None
    due_date: date | None
    currency: str
    subtotal: float
    tax_rate_percent: float
    tax: float
    total: float
    payment_terms: str | None
    po_reference: str | None
    line_items: list[LineItem]
    filename: str


class PolicyTruth(BaseModel):
    customer_name: str
    required_payment_terms: str
    po_reference_required: bool
    manual_approval_threshold: float
    currency: str


class ExpectedAnomaly(BaseModel):
    type: AnomalyType
    invoice_number: str | None = None
    field: str | None = None
    expected_difference: float | None = None
    description: str


class BenchmarkCase(BaseModel):
    case_id: str
    vendor: str
    customer: str
    currency: str
    contract_limit: float
    purchase_order_amount: float
    invoice_amount: float
    payment_terms: str
    contract: ContractTruth
    purchase_order: PurchaseOrderTruth
    invoices: list[InvoiceTruth]
    policy: PolicyTruth
    expected_anomalies: list[ExpectedAnomaly]
