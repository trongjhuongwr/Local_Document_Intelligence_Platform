import pytest

from app.extraction.patterns import deterministic_fields, extract_tax_rate_percent
from app.extraction.schemas import InvoiceExtraction
from app.extraction.service import ExtractionService
from app.llm.base import LLMTelemetry


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Tax (10%): USD 805.00", 10.0),
        ("Tax (5%)", 5.0),
        ("Tax ( 8.5 % )", 8.5),
        ("VAT 20%", 20.0),
        ("GST @ 12%", 12.0),
        ("Sales Tax of 7.25%", 7.25),
        ("Tax rate: 15%", 15.0),
        ("Tax @ 9 %", 9.0),
    ],
)
def test_reads_the_stated_rate(text: str, expected: float) -> None:
    assert extract_tax_rate_percent(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "Subtotal: USD 8,050.00\nTotal Due: USD 8,855.00",
        "",
        "Tax: USD 805.00",  # an amount, not a rate
    ],
)
def test_returns_none_without_a_labelled_rate(text: str) -> None:
    assert extract_tax_rate_percent(text) is None


@pytest.mark.parametrize("text", ["Tax (250%)", "Tax (-5%)"])
def test_rejects_implausible_rates(text: str) -> None:
    """An out-of-range percentage is not a tax rate; never propagate it."""
    assert extract_tax_rate_percent(text) is None


def test_deterministic_fields_only_apply_to_invoices() -> None:
    text = "Tax (10%)"
    assert deterministic_fields("invoice", text) == {"tax_rate_percent": 10.0}
    assert deterministic_fields("contract", text) == {}
    assert deterministic_fields("invoice", "no rate here") == {}


class WrongRateProvider:
    """Reproduces the measured failure: the model anchors on 10% for a 5% invoice."""

    async def generate(self, prompt, **kwargs):  # pragma: no cover - unused
        raise NotImplementedError

    async def generate_structured(self, prompt, schema, **kwargs):
        telemetry = LLMTelemetry(model="fake", temperature=0.0, success=True, schema_valid=True)
        if schema is InvoiceExtraction:
            return (
                InvoiceExtraction(
                    invoice_number="INV-1",
                    subtotal=8050.0,
                    tax_rate_percent=10.0,
                    tax=402.5,
                    total=8452.5,
                ),
                telemetry,
            )
        return schema(value="null"), telemetry


async def test_document_text_overrides_a_wrong_model_rate() -> None:
    service = ExtractionService(WrongRateProvider())
    outcome = await service.extract("invoice", "Subtotal: 8050.00\nTax (5%): 402.50")

    assert outcome.data.tax_rate_percent == 5.0
    assert "tax_rate_percent" in outcome.deterministic_fields


async def test_agreeing_values_are_not_reported_as_overridden() -> None:
    service = ExtractionService(WrongRateProvider())
    outcome = await service.extract("invoice", "Subtotal: 8050.00\nTax (10%): 805.00")

    assert outcome.data.tax_rate_percent == 10.0
    assert outcome.deterministic_fields == []
