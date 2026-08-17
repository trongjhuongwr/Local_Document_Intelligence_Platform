from pathlib import Path

import pytest

from evals.common import load_benchmark_cases, markdown_table, precision_recall_f1
from evals.discrepancy.run import perfect_case_documents, run_discrepancy_eval
from synthetic_data.generator import generate_benchmark


@pytest.fixture(scope="module")
def benchmark_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    output = tmp_path_factory.mktemp("bench")
    generate_benchmark(seed=99, cases=8, output_dir=output)
    return output


def test_precision_recall_f1_helper() -> None:
    scores = precision_recall_f1(tp=8, fp=2, fn=0)
    assert scores["precision"] == 0.8
    assert scores["recall"] == 1.0
    assert scores["f1"] == pytest.approx(0.8889, abs=1e-4)
    assert precision_recall_f1(0, 0, 0) == {"precision": 0.0, "recall": 0.0, "f1": 0.0}


def test_markdown_table_shape() -> None:
    table = markdown_table(["A", "B"], [["1", "2"]])
    assert table.splitlines()[0] == "| A | B |"
    assert table.splitlines()[2] == "| 1 | 2 |"


def test_load_benchmark_cases(benchmark_dir: Path) -> None:
    cases = load_benchmark_cases(benchmark_dir)
    assert len(cases) == 8
    assert cases[0].case_id == "case_001"


def test_load_benchmark_cases_missing_dir(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match=r"synthetic_data\.generator"):
        load_benchmark_cases(tmp_path)


def test_perfect_case_documents_round_trip(benchmark_dir: Path) -> None:
    case = load_benchmark_cases(benchmark_dir)[0]
    documents = perfect_case_documents(case)
    assert documents.contract is not None
    assert documents.contract.maximum_amount == case.contract.maximum_amount
    assert len(documents.invoices) == len(case.invoices)


async def test_rules_mode_scores_perfectly(benchmark_dir: Path) -> None:
    payload = await run_discrepancy_eval("rules", benchmark_dir=benchmark_dir, write=False)
    assert payload["cases_evaluated"] == 8
    assert payload["overall"]["precision"] == 1.0
    assert payload["overall"]["recall"] == 1.0
    assert payload["overall"]["f1"] == 1.0


async def test_unknown_mode_raises(benchmark_dir: Path) -> None:
    with pytest.raises(ValueError, match="Unknown mode"):
        await run_discrepancy_eval("bogus", benchmark_dir=benchmark_dir, write=False)
