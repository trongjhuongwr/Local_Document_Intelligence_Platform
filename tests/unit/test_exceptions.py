import httpx
from fastapi import FastAPI

from app.core.exceptions import DocumentParseError, OllamaUnavailableError


async def test_app_error_maps_to_json_response(app: FastAPI) -> None:
    @app.get("/boom")
    async def boom() -> None:
        raise DocumentParseError("could not parse page 3", details={"page": 3})

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/boom")

    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "document_parse_error"
    assert body["message"] == "could not parse page 3"
    assert body["details"] == {"page": 3}


async def test_unexpected_error_hides_stack_trace(app: FastAPI) -> None:
    @app.get("/crash")
    async def crash() -> None:
        raise RuntimeError("secret internal detail")

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/crash")

    assert response.status_code == 500
    body = response.json()
    assert body["error"] == "internal_error"
    assert "secret internal detail" not in response.text


def test_error_codes_are_distinct() -> None:
    assert DocumentParseError.error_code != OllamaUnavailableError.error_code
    assert OllamaUnavailableError.status_code == 503
