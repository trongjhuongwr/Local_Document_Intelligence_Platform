from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import update

from app.api.routes.audit import router as audit_router
from app.api.routes.cases import router as cases_router
from app.api.routes.compare import router as compare_router
from app.api.routes.documents import router as documents_router
from app.api.routes.evals import router as evals_router
from app.api.routes.health import router as health_router
from app.api.routes.query import router as query_router
from app.api.routes.retrieval import router as retrieval_router
from app.api.routes.reviews import router as reviews_router
from app.api.routes.workflows import router as workflows_router
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import configure_logging, get_logger
from app.db.session import get_sessionmaker
from app.models import WorkflowRun

logger = get_logger(__name__)

API_PREFIX = "/api"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info("application_startup", environment=settings.environment)
    async with get_sessionmaker()() as session:
        await session.execute(
            update(WorkflowRun)
            .where(WorkflowRun.status.in_(["queued", "running"]))
            .values(
                status="failed",
                errors=["Workflow interrupted by process restart"],
                completed_at=datetime.now(UTC),
            )
        )
        await session.commit()
    yield
    logger.info("application_shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )
    # The SPA calls everything under /api; keep that the canonical prefix.
    for router in (
        health_router,
        cases_router,
        documents_router,
        retrieval_router,
        query_router,
        compare_router,
        reviews_router,
        workflows_router,
        audit_router,
        evals_router,
    ):
        app.include_router(router, prefix=API_PREFIX)
    # Bare /health and /ready stay for container and orchestrator probes.
    app.include_router(health_router)

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        logger.warning(
            "application_error",
            error_code=exc.error_code,
            path=request.url.path,
            message=exc.message,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.error_code, "message": exc.message, "details": exc.details},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled_error", path=request.url.path, error_type=type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content={"error": "internal_error", "message": "An internal error occurred."},
        )

    return app


app = create_app()
