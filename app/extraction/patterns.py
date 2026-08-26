"""Deterministic extraction of labelled numeric fields from document text.

Some invoice fields are written as a *labelled pattern* rather than free prose —
a tax rate always appears next to the word "Tax" and a percent sign. Asking a
1B model to copy that digit is the wrong tool for the job, and the benchmark
shows why: on DocFlowBench the model reproduced 8% and 10% correctly but
returned 10 for every 5% invoice, anchoring on the more common rate (the
prompt's own ``e.g. "10"`` reinforced it). Extraction accuracy for
``tax_rate_percent`` was 47.1%, and because the tax rule compares
``subtotal * rate / 100`` against the stated tax, that single field produced 7
of the 11 false positives in end-to-end discrepancy detection.

A regex reads the same value with certainty whenever the label is present, so
software decides first and the model is only consulted when no pattern matches.
The pattern list covers the common invoice spellings; it is not exhaustive, and
anything unmatched falls through to the model rather than to a guess.
"""

import re

# Ordered by specificity. Each pattern must capture the numeric rate in group 1.
TAX_RATE_PATTERNS: tuple[re.Pattern[str], ...] = (
    # "Tax (10%)", "Tax (8.5 %)"
    re.compile(r"tax\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\)", re.IGNORECASE),
    # "VAT 10%", "GST @ 10%", "Sales Tax of 8.5%"
    re.compile(
        r"(?:vat|gst|sales\s+tax)\s*(?:@|of|:)?\s*(\d+(?:\.\d+)?)\s*%",
        re.IGNORECASE,
    ),
    # "Tax rate: 10%", "Tax @ 10 %"
    re.compile(r"tax\s*(?:rate)?\s*(?:@|:)\s*(\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
)

# A percentage outside this range is not a tax rate; treat it as no match rather
# than propagating an implausible value into the discrepancy rules.
MIN_TAX_RATE_PERCENT = 0.0
MAX_TAX_RATE_PERCENT = 100.0


def extract_tax_rate_percent(document_text: str) -> float | None:
    """Return the stated tax rate, or None when no known pattern matches."""
    for pattern in TAX_RATE_PATTERNS:
        match = pattern.search(document_text)
        if match is None:
            continue
        try:
            value = float(match.group(1))
        except ValueError:  # pragma: no cover - regex only captures digits
            continue
        if MIN_TAX_RATE_PERCENT <= value <= MAX_TAX_RATE_PERCENT:
            return value
    return None


# document_type -> {field: extractor}. Only invoices carry a stated tax rate.
DETERMINISTIC_FIELD_EXTRACTORS: dict[str, dict[str, object]] = {
    "invoice": {"tax_rate_percent": extract_tax_rate_percent},
}


def deterministic_fields(document_type: str, document_text: str) -> dict[str, float]:
    """Every field this module can read straight from the document text."""
    extractors = DETERMINISTIC_FIELD_EXTRACTORS.get(document_type, {})
    resolved: dict[str, float] = {}
    for field, extractor in extractors.items():
        value = extractor(document_text)  # type: ignore[operator]
        if value is not None:
            resolved[field] = value
    return resolved
