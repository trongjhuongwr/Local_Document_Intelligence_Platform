import os
from collections.abc import AsyncIterator

import httpx
import pytest
from fastapi import FastAPI

if test_database_url := os.environ.get("TEST_DATABASE_URL"):
    from app.core.config import assert_safe_database_url, get_settings

    assert_safe_database_url(test_database_url, role="test")
    os.environ["DATABASE_URL"] = test_database_url
    get_settings.cache_clear()

from app.api.main import create_app


@pytest.fixture
def app() -> FastAPI:
    return create_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
