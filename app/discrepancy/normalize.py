"""Value normalisation used before any cross-document comparison.

Comparisons must never fail on formatting noise (case, punctuation, legal
suffixes, currency symbols), only on genuine differences.
"""

import re

_LEGAL_SUFFIXES = {
    "ltd",
    "llc",
    "gmbh",
    "inc",
    "co",
    "corp",
    "corporation",
    "jsc",
    "group",
    "holdings",
    "limited",
    "company",
}

_CURRENCY_SYMBOLS = {"$": "USD", "€": "EUR", "£": "GBP", "₫": "VND"}

_TERMS_PATTERN = re.compile(r"(?i)\bnet\s*-?\s*(\d+)\b")

_PUNCTUATION = re.compile(r"[^\w\s]")
_WHITESPACE = re.compile(r"\s+")


def normalize_company_name(value: str | None) -> str | None:
    if value is None:
        return None
    text = _PUNCTUATION.sub(" ", value.lower())
    words = [w for w in _WHITESPACE.split(text) if w and w not in _LEGAL_SUFFIXES]
    return " ".join(words) or None


def normalize_currency(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    if text in _CURRENCY_SYMBOLS:
        return _CURRENCY_SYMBOLS[text]
    text = text.upper()
    return text or None


def normalize_payment_terms(value: str | None) -> str | None:
    if value is None:
        return None
    match = _TERMS_PATTERN.search(value)
    if match:
        return f"Net {int(match.group(1))}"
    normalized = _WHITESPACE.sub(" ", value.strip())
    return normalized or None
