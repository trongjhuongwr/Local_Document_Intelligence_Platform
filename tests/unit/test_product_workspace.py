import re

import pytest

from app.core.config import assert_safe_database_url, database_name
from app.services.cases import calculate_readiness, generate_case_id, slugify_case_name
from app.services.compare import initial_workflow_steps
from app.services.hints import infer_document_type, suggested_questions


def test_case_id_generation_is_readable_and_unique() -> None:
    first = generate_case_id("Acme March Invoice Review")
    second = generate_case_id("Acme March Invoice Review")
    assert re.fullmatch(r"acme-march-invoice-review-[0-9a-f]{4}", first)
    assert first != second
    assert slugify_case_name("  Hợp đồng / Invoice  ") == "hop-ong-invoice"


@pytest.mark.parametrize(
    ("types", "readiness", "missing"),
    [
        (set(), "blocked", ["contract", "invoice", "purchase_order", "policy"]),
        ({"contract"}, "blocked", ["invoice", "purchase_order", "policy"]),
        ({"contract", "invoice"}, "limited", ["purchase_order", "policy"]),
        (
            {"contract", "invoice", "purchase_order", "policy"},
            "complete",
            [],
        ),
    ],
)
def test_readiness_matrix(types: set[str], readiness: str, missing: list[str]) -> None:
    assert calculate_readiness(types) == (readiness, missing)


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("Service Agreement.pdf", "contract"),
        ("INV-2026-0042.pdf", "invoice"),
        ("purchase-order.csv", "purchase_order"),
        ("accounts_payable_policy.docx", "policy"),
        ("notes.txt", None),
    ],
)
def test_filename_document_type_heuristic(filename: str, expected: str | None) -> None:
    assert infer_document_type(filename) == expected


def test_database_safety_guard() -> None:
    product = "postgresql+asyncpg://user:secret@localhost/docintel_product"
    assert database_name(product) == "docintel_product"
    with pytest.raises(RuntimeError, match="Refusing"):
        assert_safe_database_url(product, role="test")
    with pytest.raises(RuntimeError, match="docintel_eval"):
        assert_safe_database_url(
            "postgresql+asyncpg://user:secret@localhost/docintel_test", role="eval"
        )
    assert_safe_database_url(
        "postgresql+asyncpg://user:secret@localhost/docintel_test", role="test"
    )


def test_progress_steps_are_stable_and_pending() -> None:
    steps = initial_workflow_steps()
    assert [step["step"] for step in steps] == [
        "load_documents",
        "extract_fields",
        "run_discrepancy_rules",
        "create_review_tasks",
        "generate_report",
    ]
    assert {step["status"] for step in steps} == {"pending"}


def test_suggested_questions_follow_available_documents() -> None:
    suggestions = suggested_questions({"contract", "invoice", "purchase_order"})
    assert any("payment terms" in question for question in suggestions)
    assert any("purchase order" in question for question in suggestions)
