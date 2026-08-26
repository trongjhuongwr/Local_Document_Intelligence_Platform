from typing import Any

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.config import Settings, get_settings
from app.db.session import check_database_connection

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    settings = get_settings()
    return {"status": "ok", "version": settings.app_version}


async def check_database(settings: Settings) -> dict[str, Any]:
    try:
        await check_database_connection()
    except Exception as exc:  # pragma: no cover - message depends on driver
        return {
            "status": "error",
            "detail": f"PostgreSQL unreachable: {type(exc).__name__}",
            "hint": "Start the database with: docker compose up -d postgres",
        }
    return {"status": "ok"}


async def check_ollama(settings: Settings) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(base_url=settings.ollama_base_url, timeout=5.0) as client:
            response = await client.get("/api/tags")
            response.raise_for_status()
    except (httpx.HTTPError, OSError) as exc:
        return {
            "status": "error",
            "detail": f"Ollama unreachable at {settings.ollama_base_url}: {type(exc).__name__}",
            "hint": "Start Ollama on the host machine",
        }

    available = {model.get("name", "") for model in response.json().get("models", [])}
    checks: dict[str, Any] = {"status": "ok"}
    for role, model in (
        ("llm_model", settings.ollama_llm_model),
        ("embedding_model", settings.ollama_embedding_model),
    ):
        # Ollama lists models as "name:tag"; accept a bare-name match for default tags.
        found = model in available or any(name.split(":")[0] == model for name in available)
        checks[role] = {"model": model, "available": found}
        if not found:
            checks["status"] = "error"
            checks[role]["hint"] = f"Run: ollama pull {model}"
    return checks


@router.get("/ready")
async def ready() -> JSONResponse:
    settings = get_settings()
    checks = {
        "database": await check_database(settings),
        "ollama": await check_ollama(settings),
    }
    ok = all(item["status"] == "ok" for item in checks.values())
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ready" if ok else "not_ready", "checks": checks},
    )
