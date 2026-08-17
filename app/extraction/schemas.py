"""Pydantic schemas for structured extraction.

These are the exact shapes the LLM is asked to produce (via Ollama structured
outputs). Every field is nullable: when a document does not state a value the
model must return null, never invent one. Lenient pre-validators absorb common
small-model formatting quirks (currency prefixes, thousand separators, a few
date formats) without ever fabricating values — anything unparseable raises,
which triggers the schema-repair retry upstream.
"""

import re
from datetime import date, datetime
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict

_NULL_STRINGS = {"", "null", "none", "n/a", "na", "unknown", "not specified", "not stated"}

_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%B %d, %Y", "%d %B %Y", "%b %d, %Y")

_CURRENCY_PREFIX = re.compile(r"(?i)^(usd|eur|gbp|vnd|\$|€|£)\s*")


def _parse_date(value: Any) -> Any:
    if value is None or isinstance(value, date):
        return value
    if isinstance(value, str):
        text = value.strip()
        if text.lower() in _NULL_STRINGS:
            return None
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
    raise ValueError(f"unparseable date: {value!r}")


def _parse_money(value: Any) -> Any:
    if value is None or isinstance(value, int | float):
        return value
    if isinstance(value, str):
        text = _CURRENCY_PREFIX.sub("", value.strip()).replace(",", "").strip()
        if text.lower() in _NULL_STRINGS:
            return None
        return float(text)
    raise ValueError(f"unparseable amount: {value!r}")


def _parse_text(value: Any) -> Any:
    if isinstance(value, str) and value.strip().lower() in _NULL_STRINGS:
        return None
    return value


FlexibleDate = Annotated[date | None, BeforeValidator(_parse_date)]
FlexibleMoney = Annotated[float | None, BeforeValidator(_parse_money)]
FlexibleText = Annotated[str | None, BeforeValidator(_parse_text)]


class InvoiceExtraction(BaseModel):
    model_config = ConfigDict(extra="ignore")

    invoice_number: FlexibleText = None
    vendor_name: FlexibleText = None
    customer_name: FlexibleText = None
    issue_date: FlexibleDate = None
    due_date: FlexibleDate = None
    currency: FlexibleText = None
    subtotal: FlexibleMoney = None
    tax_rate_percent: FlexibleMoney = None
    tax: FlexibleMoney = None
    total: FlexibleMoney = None
    payment_terms: FlexibleText = None
    po_reference: FlexibleText = None


class ContractExtraction(BaseModel):
    model_config = ConfigDict(extra="ignore")

    vendor_name: FlexibleText = None
    customer_name: FlexibleText = None
    effective_date: FlexibleDate = None
    expiration_date: FlexibleDate = None
    currency: FlexibleText = None
    maximum_amount: FlexibleMoney = None
    payment_terms: FlexibleText = None
    obligations: list[str] = []


class PurchaseOrderExtraction(BaseModel):
    model_config = ConfigDict(extra="ignore")

    po_number: FlexibleText = None
    vendor_name: FlexibleText = None
    customer_name: FlexibleText = None
    issue_date: FlexibleDate = None
    currency: FlexibleText = None
    approved_amount: FlexibleMoney = None


class PolicyExtraction(BaseModel):
    model_config = ConfigDict(extra="ignore")

    required_payment_terms: FlexibleText = None
    po_reference_required: bool | None = None
    manual_approval_threshold: FlexibleMoney = None
    currency: FlexibleText = None


EXTRACTION_SCHEMAS: dict[str, type[BaseModel]] = {
    "invoice": InvoiceExtraction,
    "contract": ContractExtraction,
    "purchase_order": PurchaseOrderExtraction,
    "policy": PolicyExtraction,
}
