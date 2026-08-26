"""Attach deterministic document/page evidence to discrepancy findings.

The rule engine stays pure and only reasons over structured values. This
module enriches its findings afterwards by mapping each rule and field back to
the parsed chunks that supplied those values. The mapping is deterministic and
best-effort: page numbers remain null for formats such as DOCX/TXT that do not
have stable pages.
"""

from typing import Any

from app.discrepancy.models import Discrepancy, DiscrepancyKind, EvidenceRef

_MAX_SNIPPET_CHARS = 320

_FIELD_HINTS: dict[str, tuple[str, ...]] = {
    "invoice_number": ("invoice number",),
    "vendor_name": ("from", "vendor", "provider"),
    "issue_date": ("issue date",),
    "due_date": ("due date",),
    "currency": ("currency", "all amounts"),
    "subtotal": ("subtotal",),
    "tax": ("tax (", "tax:"),
    "tax_rate_percent": ("tax (",),
    "total": ("total due", "stated total"),
    "payment_terms": ("payment terms",),
    "po_reference": ("po reference", "purchase order reference"),
    "maximum_amount": ("maximum aggregate fees", "shall not exceed"),
    "approved_amount": ("approved amount",),
    "effective_date": ("effective date",),
    "expiration_date": ("expiration date",),
    "po_reference_required": ("purchase order requirement", "must reference"),
}

_RULE_SOURCES: dict[DiscrepancyKind, tuple[tuple[str, str], ...]] = {
    DiscrepancyKind.AMOUNT_EXCEEDS_CONTRACT: (
        ("invoice", "total"),
        ("contract", "maximum_amount"),
    ),
    DiscrepancyKind.PO_MISMATCH: (
        ("invoice", "total"),
        ("purchase_order", "approved_amount"),
    ),
    DiscrepancyKind.WRONG_CURRENCY: (
        ("invoice", "currency"),
        ("contract", "currency"),
    ),
    DiscrepancyKind.VENDOR_NAME_MISMATCH: (
        ("invoice", "vendor_name"),
        ("contract", "vendor_name"),
        ("purchase_order", "vendor_name"),
    ),
    DiscrepancyKind.INVOICE_DATE_OUTSIDE_CONTRACT: (
        ("invoice", "issue_date"),
        ("contract", "effective_date"),
        ("contract", "expiration_date"),
    ),
    DiscrepancyKind.INCONSISTENT_PAYMENT_TERMS: (
        ("invoice", "payment_terms"),
        ("contract", "payment_terms"),
    ),
    DiscrepancyKind.INCORRECT_TAX_CALCULATION: (
        ("invoice", "subtotal"),
        ("invoice", "tax_rate_percent"),
        ("invoice", "tax"),
    ),
    DiscrepancyKind.INCORRECT_TOTAL: (
        ("invoice", "subtotal"),
        ("invoice", "tax"),
        ("invoice", "total"),
    ),
    DiscrepancyKind.DUPLICATE_INVOICE: (("invoice", "invoice_number"),),
    DiscrepancyKind.CONFLICTING_INVOICE_NUMBER: (("invoice", "invoice_number"),),
    DiscrepancyKind.POLICY_VIOLATION: (
        ("invoice", "po_reference"),
        ("policy", "po_reference_required"),
    ),
}


def attach_evidence(
    discrepancies: list[Discrepancy],
    documents: dict[str, dict[str, Any]],
    extractions: dict[str, dict[str, Any]],
) -> list[Discrepancy]:
    """Return findings enriched with source-document and page references."""
    enriched: list[Discrepancy] = []
    for discrepancy in discrepancies:
        sources = _RULE_SOURCES.get(discrepancy.type, ())
        if discrepancy.type == DiscrepancyKind.MISSING_REQUIRED_FIELD and discrepancy.field:
            sources = (("invoice", discrepancy.field),)

        evidence: list[EvidenceRef] = []
        seen: set[tuple[str, str, int | None]] = set()
        for document_type, field in sources:
            for document_id in _matching_documents(
                document_type,
                discrepancy.invoice_number,
                documents,
                extractions,
            ):
                reference = _reference(document_id, field, documents, extractions)
                key = (document_id, field, reference.page_number)
                if key not in seen:
                    seen.add(key)
                    evidence.append(reference)
        enriched.append(discrepancy.model_copy(update={"evidence": evidence}))
    return enriched


def extraction_failure_review_item(
    failure: dict[str, Any], documents: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Build an explicit high-severity review item for a failed extraction."""
    document_id = str(failure.get("document_id", ""))
    info = documents.get(document_id, {})
    reference = _reference(document_id, "structured_extraction", documents, {})
    filename = failure.get("filename") or info.get("filename") or document_id
    return {
        "type": "extraction_failure",
        "source": "SYSTEM_FAILURE",
        "severity": "high",
        "description": (
            f"Structured extraction failed for {filename}; "
            "the document requires manual review before the case can be cleared."
        ),
        "document_id": document_id or None,
        "error": failure.get("error", "structured extraction failed"),
        "evidence": [reference.model_dump(mode="json")],
    }


def _matching_documents(
    document_type: str,
    invoice_number: str | None,
    documents: dict[str, dict[str, Any]],
    extractions: dict[str, dict[str, Any]],
) -> list[str]:
    candidates = [
        document_id
        for document_id, info in documents.items()
        if info.get("document_type") == document_type
    ]
    if document_type != "invoice" or invoice_number is None:
        return candidates[:1] if document_type != "invoice" else candidates
    matches = [
        document_id
        for document_id in candidates
        if str(extractions.get(document_id, {}).get("invoice_number", "")).casefold()
        == invoice_number.casefold()
    ]
    return matches or candidates[:1]


def _reference(
    document_id: str,
    field: str,
    documents: dict[str, dict[str, Any]],
    extractions: dict[str, dict[str, Any]],
) -> EvidenceRef:
    info = documents.get(document_id, {})
    chunks = info.get("chunks") or []
    hints = list(_FIELD_HINTS.get(field, ()))
    value = extractions.get(document_id, {}).get(field)
    if value is not None and not isinstance(value, list | dict):
        hints.append(str(value).casefold())

    selected: dict[str, Any] | None = None
    for chunk in chunks:
        text = str(chunk.get("text", ""))
        lowered = text.casefold()
        if any(hint and hint in lowered for hint in hints):
            selected = chunk
            break
    if selected is None and chunks:
        selected = chunks[0]

    snippet = None
    page_number = None
    if selected is not None:
        page_number = selected.get("page_number")
        compact = " ".join(str(selected.get("text", "")).split())
        if compact:
            snippet = (
                compact
                if len(compact) <= _MAX_SNIPPET_CHARS
                else compact[: _MAX_SNIPPET_CHARS - 1].rstrip() + "…"
            )
    return EvidenceRef(
        document_id=document_id or None,
        filename=str(info.get("filename") or document_id or "unknown document"),
        document_type=info.get("document_type"),
        page_number=page_number,
        field=field,
        snippet=snippet,
    )
