from pathlib import Path
from unittest.mock import patch

import pytest
from streamlit.testing.v1 import AppTest

from ui import api_client

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def page(name: str) -> Path:
    return PROJECT_ROOT / "ui" / "pages" / name


def test_home_empty_state() -> None:
    with patch.object(api_client, "list_cases", return_value=[]):
        app = AppTest.from_file(page("home.py")).run()
    assert not app.exception
    assert app.title[0].value == "Review document packs with evidence, not guesswork"
    assert any("No cases yet" in item.value for item in app.markdown)


@pytest.mark.parametrize(("readiness", "disabled"), [("blocked", True), ("complete", False)])
def test_case_analyze_state(readiness: str, disabled: bool) -> None:
    case = {
        "case_id": "case-test",
        "name": "Case test",
        "readiness": readiness,
        "missing_document_types": (
            ["contract", "invoice", "purchase_order", "policy"] if readiness == "blocked" else []
        ),
        "document_types": (
            [] if readiness == "blocked" else ["contract", "invoice", "purchase_order", "policy"]
        ),
        "documents": [],
        "latest_workflow": None,
    }
    app = AppTest.from_file(page("cases.py"))
    app.session_state["active_case_id"] = "case-test"
    with patch.object(api_client, "get_case", return_value=case):
        app.run()
    assert not app.exception
    analyze = next(button for button in app.button if button.label == "Analyze case")
    assert analyze.disabled is disabled


def test_ask_hides_retrieval_under_advanced_settings() -> None:
    cases = [
        {
            "case_id": "case-test",
            "name": "Case test",
            "document_types": ["contract", "invoice"],
        }
    ]
    with patch.object(api_client, "list_cases", return_value=cases):
        app = AppTest.from_file(page("ask.py")).run()
    assert not app.exception
    assert any(expander.label == "Advanced settings" for expander in app.expander)
    assert any(selectbox.label == "Retrieval mode" for selectbox in app.selectbox)


def test_review_page_explains_decisions() -> None:
    cases = [{"case_id": "case-test", "name": "Case test"}]
    empty = {"reviews": [], "total": 0}
    with (
        patch.object(api_client, "list_cases", return_value=cases),
        patch.object(api_client, "reviews_page", return_value=empty),
    ):
        app = AppTest.from_file(page("reviews.py")).run()
    assert not app.exception
    copy = "\n".join(item.value for item in app.markdown)
    assert "Approve" in copy and "false positive" in copy and "Resolve" in copy
