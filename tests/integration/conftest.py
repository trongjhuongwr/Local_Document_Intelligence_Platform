"""Integration-test fixtures.

pytest-asyncio gives every test its own event loop, but the app keeps a
module-global async engine whose pooled asyncpg connections are bound to the
loop that created them. Dispose the engine after each test so the next test
opens fresh connections on its own loop.
"""

from collections.abc import AsyncIterator

import pytest

from app.db import session as db_session


@pytest.fixture(autouse=True)
async def _dispose_engine_between_tests() -> AsyncIterator[None]:
    yield
    if db_session._engine is not None:
        await db_session._engine.dispose()
