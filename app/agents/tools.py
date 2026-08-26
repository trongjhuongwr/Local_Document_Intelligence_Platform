"""Typed, allowlisted tools with Pydantic input/output contracts.

Every tool validates its input, returns a typed output, and raises
`ToolExecutionError` with a structured payload on failure. The registry is an
explicit allowlist — nothing outside it is callable, and no tool ever grants
the model file, SQL, or shell access.
"""

from collections.abc import Awaitable, Callable
from typing import Any

from pydantic import BaseModel, ValidationError

from app.core.exceptions import AppError
from app.discrepancy.engine import analyze_case
from app.discrepancy.models import CaseDocuments, DiscrepancyReport


class ToolExecutionError(AppError):
    status_code = 422
    error_code = "tool_execution_error"


# --- calculate_difference -----------------------------------------------------


class CalculateDifferenceInput(BaseModel):
    minuend: float
    subtrahend: float
    label: str = "difference"


class CalculateDifferenceOutput(BaseModel):
    label: str
    difference: float
    percentage_of_subtrahend: float | None
    formula: str


def calculate_difference(payload: CalculateDifferenceInput) -> CalculateDifferenceOutput:
    difference = round(payload.minuend - payload.subtrahend, 2)
    percentage = (
        round(difference / payload.subtrahend * 100, 2) if payload.subtrahend != 0 else None
    )
    return CalculateDifferenceOutput(
        label=payload.label,
        difference=difference,
        percentage_of_subtrahend=percentage,
        formula=f"{payload.minuend} - {payload.subtrahend}",
    )


# --- validate_totals ----------------------------------------------------------


class ValidateTotalsInput(BaseModel):
    subtotal: float
    tax: float
    stated_total: float
    tolerance: float = 0.02


class ValidateTotalsOutput(BaseModel):
    valid: bool
    computed_total: float
    stated_total: float
    difference: float


def validate_totals(payload: ValidateTotalsInput) -> ValidateTotalsOutput:
    computed = round(payload.subtotal + payload.tax, 2)
    difference = round(computed - payload.stated_total, 2)
    return ValidateTotalsOutput(
        valid=abs(difference) <= payload.tolerance,
        computed_total=computed,
        stated_total=payload.stated_total,
        difference=difference,
    )


# --- detect_duplicate_invoice -------------------------------------------------


class InvoiceRef(BaseModel):
    invoice_number: str
    total: float
    filename: str | None = None


class DetectDuplicateInput(BaseModel):
    invoices: list[InvoiceRef]


class DuplicateGroup(BaseModel):
    invoice_number: str
    count: int
    totals: list[float]
    identical_totals: bool


class DetectDuplicateOutput(BaseModel):
    duplicates: list[DuplicateGroup]


def detect_duplicate_invoice(payload: DetectDuplicateInput) -> DetectDuplicateOutput:
    by_number: dict[str, list[InvoiceRef]] = {}
    for invoice in payload.invoices:
        by_number.setdefault(invoice.invoice_number, []).append(invoice)
    duplicates = [
        DuplicateGroup(
            invoice_number=number,
            count=len(group),
            totals=[invoice.total for invoice in group],
            identical_totals=len({round(invoice.total, 2) for invoice in group}) == 1,
        )
        for number, group in by_number.items()
        if len(group) > 1
    ]
    return DetectDuplicateOutput(duplicates=duplicates)


# --- compare_document_fields (discrepancy engine as a tool) -------------------


class CompareDocumentsInput(BaseModel):
    case_documents: CaseDocuments


class CompareDocumentsOutput(BaseModel):
    report: DiscrepancyReport


def compare_document_fields(payload: CompareDocumentsInput) -> CompareDocumentsOutput:
    return CompareDocumentsOutput(report=analyze_case(payload.case_documents))


# --- registry -----------------------------------------------------------------


class ToolSpec(BaseModel):
    name: str
    purpose: str
    input_schema: type[BaseModel]
    output_schema: type[BaseModel]
    handler: Callable[..., BaseModel | Awaitable[BaseModel]]

    model_config = {"arbitrary_types_allowed": True}


TOOL_REGISTRY: dict[str, ToolSpec] = {
    spec.name: spec
    for spec in [
        ToolSpec(
            name="calculate_difference",
            purpose="Deterministically compute the difference between two amounts.",
            input_schema=CalculateDifferenceInput,
            output_schema=CalculateDifferenceOutput,
            handler=calculate_difference,
        ),
        ToolSpec(
            name="validate_totals",
            purpose="Check that subtotal + tax equals the stated total.",
            input_schema=ValidateTotalsInput,
            output_schema=ValidateTotalsOutput,
            handler=validate_totals,
        ),
        ToolSpec(
            name="detect_duplicate_invoice",
            purpose="Find invoices sharing the same invoice number.",
            input_schema=DetectDuplicateInput,
            output_schema=DetectDuplicateOutput,
            handler=detect_duplicate_invoice,
        ),
        ToolSpec(
            name="compare_document_fields",
            purpose="Run every deterministic cross-document discrepancy rule.",
            input_schema=CompareDocumentsInput,
            output_schema=CompareDocumentsOutput,
            handler=compare_document_fields,
        ),
    ]
}


def run_tool(name: str, payload: dict[str, Any]) -> BaseModel:
    """Execute an allowlisted tool with validated input; structured errors on failure."""
    spec = TOOL_REGISTRY.get(name)
    if spec is None:
        raise ToolExecutionError(
            f"Unknown tool '{name}'",
            details={"allowed_tools": sorted(TOOL_REGISTRY)},
        )
    try:
        validated = spec.input_schema.model_validate(payload)
    except ValidationError as exc:
        raise ToolExecutionError(
            f"Invalid input for tool '{name}'",
            details={"validation_errors": exc.errors(include_url=False)},
        ) from exc
    result = spec.handler(validated)
    if not isinstance(result, spec.output_schema):  # defensive: contract enforcement
        raise ToolExecutionError(
            f"Tool '{name}' returned an unexpected type",
            details={"expected": spec.output_schema.__name__},
        )
    return result
