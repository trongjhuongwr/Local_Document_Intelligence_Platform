import httpx
import pytest

from app.api.routes import health as health_module
from app.core.config import Settings


async def test_health_returns_ok(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body


async def test_bare_probe_paths_remain_for_containers(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def ok_check(settings: Settings) -> dict:
        return {"status": "ok"}

    monkeypatch.setattr(health_module, "check_database", ok_check)
    monkeypatch.setattr(health_module, "check_ollama", ok_check)

    assert (await client.get("/health")).status_code == 200
    assert (await client.get("/ready")).status_code == 200


async def test_ready_ok_when_all_checks_pass(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def ok_check(settings: Settings) -> dict:
        return {"status": "ok"}

    monkeypatch.setattr(health_module, "check_database", ok_check)
    monkeypatch.setattr(health_module, "check_ollama", ok_check)

    response = await client.get("/api/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"


async def test_ready_503_when_database_down(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def failing_db(settings: Settings) -> dict:
        return {"status": "error", "detail": "PostgreSQL unreachable"}

    async def ok_check(settings: Settings) -> dict:
        return {"status": "ok"}

    monkeypatch.setattr(health_module, "check_database", failing_db)
    monkeypatch.setattr(health_module, "check_ollama", ok_check)

    response = await client.get("/api/ready")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["checks"]["database"]["status"] == "error"


async def test_check_ollama_reports_missing_model(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_tags_response(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": "llama3.2:1b"}]})

    transport = httpx.MockTransport(fake_tags_response)
    original_client = httpx.AsyncClient

    def patched_client(**kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return original_client(**kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(health_module.httpx, "AsyncClient", patched_client)

    settings = Settings(ollama_llm_model="llama3.2:1b", ollama_embedding_model="all-minilm")
    result = await health_module.check_ollama(settings)

    assert result["status"] == "error"
    assert result["llm_model"]["available"] is True
    assert result["embedding_model"]["available"] is False
    assert "ollama pull all-minilm" in result["embedding_model"]["hint"]
