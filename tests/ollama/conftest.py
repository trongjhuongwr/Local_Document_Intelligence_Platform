"""Keep live-model retrieval tests isolated from the product database."""

import os

import pytest

from app.core.config import assert_safe_database_url, get_settings


@pytest.fixture(scope="session", autouse=True)
def _activate_test_database_for_live_tests() -> None:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        raise RuntimeError("TEST_DATABASE_URL is required for Ollama tests")
    assert_safe_database_url(url, role="test")
    os.environ["DATABASE_URL"] = url
    get_settings.cache_clear()
