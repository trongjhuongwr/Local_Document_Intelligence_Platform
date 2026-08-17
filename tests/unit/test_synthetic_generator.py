import json
from pathlib import Path

import pytest

from synthetic_data.generator import generate_benchmark
from synthetic_data.generator.__main__ import main as generator_main
from synthetic_data.generator.builder import build_case
from synthetic_data.generator.models import AnomalyType, BenchmarkCase

SEED = 42
CASES = 12


@pytest.fixture(scope="module")
def generated(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, list[BenchmarkCase]]:
    output = tmp_path_factory.mktemp("bench")
    cases = generate_benchmark(seed=SEED, cases=CASES, output_dir=output)
    return output, cases


def test_same_seed_produces_identical_output(
    generated: tuple[Path, list[BenchmarkCase]], tmp_path: Path
) -> None:
    first_dir, _ = generated
    second_dir = tmp_path / "again"
    generate_benchmark(seed=SEED, cases=CASES, output_dir=second_dir)

    first_gt = sorted((first_dir / "ground_truth").glob("*.json"))
    second_gt = sorted((second_dir / "ground_truth").glob("*.json"))
    assert [p.name for p in first_gt] == [p.name for p in second_gt]
    for a, b in zip(first_gt, second_gt, strict=True):
        assert a.read_bytes() == b.read_bytes(), f"ground truth differs: {a.name}"

    sample_pdf = "case_001/service_contract.pdf"
    assert (first_dir / "documents" / sample_pdf).read_bytes() == (
        second_dir / "documents" / sample_pdf
    ).read_bytes(), "PDF bytes are not deterministic"


def test_different_seed_changes_output() -> None:
    assert build_case(SEED, 1) != build_case(SEED + 1, 1)


def test_documents_rendered_for_every_case(
    generated: tuple[Path, list[BenchmarkCase]],
) -> None:
    output, cases = generated
    for case in cases:
        case_dir = output / "documents" / case.case_id
        expected = {"service_contract.pdf", "purchase_order.pdf", "payment_policy.pdf"} | {
            invoice.filename for invoice in case.invoices
        }
        present = {p.name for p in case_dir.glob("*.pdf")}
        assert present == expected
        for pdf in case_dir.glob("*.pdf"):
            assert pdf.read_bytes().startswith(b"%PDF"), f"not a PDF: {pdf}"


def test_manifest_written(generated: tuple[Path, list[BenchmarkCase]]) -> None:
    output, cases = generated
    manifest = json.loads((output / "ground_truth" / "manifest.json").read_text())
    assert manifest["benchmark"] == "DocFlowBench"
    assert manifest["seed"] == SEED
    assert manifest["case_count"] == CASES
    assert manifest["case_ids"] == [case.case_id for case in cases]


def test_mixture_of_clean_and_anomalous_cases(
    generated: tuple[Path, list[BenchmarkCase]],
) -> None:
    _, cases = generated
    clean = [case for case in cases if not case.expected_anomalies]
    anomalous = [case for case in cases if case.expected_anomalies]
    assert clean, "expected at least one clean case for this seed"
    assert anomalous, "expected at least one anomalous case for this seed"


def _has(case: BenchmarkCase, anomaly_type: AnomalyType) -> bool:
    return any(a.type == anomaly_type for a in case.expected_anomalies)


def test_case_invariants_hold() -> None:
    """Generate a wider pool and verify every anomaly is genuinely present."""
    cases = [build_case(seed=123, index=i) for i in range(1, 41)]
    seen: set[AnomalyType] = set()

    for case in cases:
        contract = case.contract
        po = case.purchase_order
        invoice = case.invoices[0]
        seen.update(a.type for a in case.expected_anomalies)

        if not _has(case, AnomalyType.INCORRECT_TOTAL):
            assert invoice.subtotal + invoice.tax == pytest.approx(invoice.total, abs=0.02)
        else:
            assert abs((invoice.subtotal + invoice.tax) - invoice.total) > 0.02

        if not _has(case, AnomalyType.INCORRECT_TAX_CALCULATION):
            expected_tax = invoice.subtotal * invoice.tax_rate_percent / 100
            assert invoice.tax == pytest.approx(expected_tax, abs=0.02)
        else:
            expected_tax = invoice.subtotal * invoice.tax_rate_percent / 100
            assert abs(invoice.tax - expected_tax) > 0.02

        if _has(case, AnomalyType.AMOUNT_EXCEEDS_CONTRACT):
            assert invoice.total > contract.maximum_amount
            anomaly = next(
                a for a in case.expected_anomalies if a.type == AnomalyType.AMOUNT_EXCEEDS_CONTRACT
            )
            assert anomaly.expected_difference == pytest.approx(
                invoice.total - contract.maximum_amount, abs=0.01
            )
        elif not _has(case, AnomalyType.PO_MISMATCH):
            assert invoice.total <= po.approved_amount
            assert po.approved_amount <= contract.maximum_amount

        if _has(case, AnomalyType.PO_MISMATCH):
            assert invoice.total > po.approved_amount
            assert invoice.total <= contract.maximum_amount

        if _has(case, AnomalyType.WRONG_CURRENCY):
            assert invoice.currency != contract.currency
        else:
            assert invoice.currency == contract.currency

        if _has(case, AnomalyType.VENDOR_NAME_MISMATCH):
            assert invoice.vendor_name != contract.vendor_name
        else:
            assert invoice.vendor_name == contract.vendor_name

        if _has(case, AnomalyType.DUPLICATE_INVOICE):
            assert len(case.invoices) == 2
            assert case.invoices[1].invoice_number == invoice.invoice_number
            assert case.invoices[1].total == invoice.total

        if _has(case, AnomalyType.CONFLICTING_INVOICE_NUMBER):
            assert len(case.invoices) == 2
            assert case.invoices[1].invoice_number == invoice.invoice_number
            assert case.invoices[1].total != invoice.total

        if _has(case, AnomalyType.INVOICE_DATE_OUTSIDE_CONTRACT):
            assert invoice.issue_date is not None
            assert invoice.issue_date > contract.expiration_date
        elif invoice.issue_date is not None:
            assert contract.effective_date <= invoice.issue_date <= contract.expiration_date

        if _has(case, AnomalyType.INCONSISTENT_PAYMENT_TERMS):
            assert invoice.payment_terms != contract.payment_terms
        elif invoice.payment_terms is not None:
            assert invoice.payment_terms == contract.payment_terms

        if _has(case, AnomalyType.MISSING_REQUIRED_FIELD):
            assert invoice.due_date is None
        else:
            assert invoice.due_date is not None

        if _has(case, AnomalyType.POLICY_VIOLATION):
            assert invoice.po_reference is None
        else:
            assert invoice.po_reference == po.po_number

    # The 40-case pool should exercise most anomaly types.
    assert len(seen) >= 8, f"only {len(seen)} anomaly types seen: {sorted(t.value for t in seen)}"


def test_cli_runs(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = generator_main(["--seed", "7", "--cases", "3", "--output-dir", str(tmp_path)])
    assert exit_code == 0
    out = capsys.readouterr().out
    assert "Generated 3 cases" in out
    assert (tmp_path / "ground_truth" / "case_003.json").exists()
