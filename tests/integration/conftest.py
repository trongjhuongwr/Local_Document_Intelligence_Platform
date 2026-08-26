"""Integration-test fixtures.

pytest-asyncio gives every test its own event loop, but the app keeps a
module-global async engine whose pooled asyncpg connections are bound to the
loop that created them. Dispose the engine after each test so the next test
opens fresh connections on its own loop.
"""

import os
from collections.abc import AsyncIterator

import pytest

from app.core.config import assert_safe_database_url, get_settings
from app.db import session as db_session


@pytest.fixture(scope="session", autouse=True)
def _activate_test_database() -> None:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        raise RuntimeError("TEST_DATABASE_URL is required for integration tests")
    assert_safe_database_url(url, role="test")
    os.environ["DATABASE_URL"] = url
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
async def _dispose_engine_between_tests() -> AsyncIterator[None]:
    yield
    if db_session._engine is not None:
        await db_session._engine.dispose()
