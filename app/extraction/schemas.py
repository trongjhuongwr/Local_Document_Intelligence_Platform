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

_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
_NUMBER = re.compile(r"-?\d[\d,]*(?:\.\d+)?")

_TRUE_STRINGS = {"true", "yes", "required", "1"}
_FALSE_STRINGS = {"false", "no", "not required", "0"}


def _parse_date(value: Any) -> Any:
    if value is None or isinstance(value, date):
        return value
    if isinstance(value, str):
        text = value.strip()
        if text.lower() in _NULL_STRINGS:
            return None
        iso = _ISO_DATE.search(text)
        if iso:
            try:
                return date.fromisoformat(iso.group(0))
            except ValueError:
                pass
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
        # Unparseable model text becomes "missing" — never an invented date.
        return None
    raise ValueError(f"unparseable date: {value!r}")


def _parse_money(value: Any) -> Any:
    if value is None or isinstance(value, int | float):
        return value
    if isinstance(value, str):
        text = value.strip()
        if text.lower() in _NULL_STRINGS:
            return None
        match = _NUMBER.search(text)
        if match is None:
            return None
        return float(match.group(0).replace(",", ""))
    raise ValueError(f"unparseable amount: {value!r}")


def _parse_bool(value: Any) -> Any:
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, str):
        text = value.strip().lower()
        if text in _NULL_STRINGS:
            return None
        if text in _TRUE_STRINGS:
            return True
        if text in _FALSE_STRINGS:
            return False
        return None
    raise ValueError(f"unparseable boolean: {value!r}")


def _parse_text(value: Any) -> Any:
    if isinstance(value, str):
        text = value.strip()
        # Small models sometimes echo the field label ("PO Reference: X" or a
        # bare "PO Reference:"); keep only what follows the label.
        if ":" in text:
            text = text.rsplit(":", 1)[-1].strip()
        if text.lower() in _NULL_STRINGS:
            return None
        return text
    return value


# `json_schema_input_type=str` makes every field a REQUIRED STRING in the schema
# Ollama constrains decoding against: the 1B model only ever copies text (or
# writes "null"), and the validators normalise to typed values. With nullable
# anyOf schemas the model overwhelmingly took the short null branch — measured
# 11.5% field accuracy versus copy-then-parse.
FlexibleDate = Annotated[date | None, BeforeValidator(_parse_date, json_schema_input_type=str)]
FlexibleMoney = Annotated[float | None, BeforeValidator(_parse_money, json_schema_input_type=str)]
FlexibleBool = Annotated[bool | None, BeforeValidator(_parse_bool, json_schema_input_type=str)]
FlexibleText = Annotated[str | None, BeforeValidator(_parse_text, json_schema_input_type=str)]


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
    po_reference_required: FlexibleBool = None
    manual_approval_threshold: FlexibleMoney = None
    currency: FlexibleText = None


EXTRACTION_SCHEMAS: dict[str, type[BaseModel]] = {
    "invoice": InvoiceExtraction,
    "contract": ContractExtraction,
    "purchase_order": PurchaseOrderExtraction,
    "policy": PolicyExtraction,
}
