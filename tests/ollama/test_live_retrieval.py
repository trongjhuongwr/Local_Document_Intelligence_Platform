"""Live retrieval smoke test: real Ollama embeddings (all-minilm) + PostgreSQL.

Run with: pytest -m ollama tests/ollama/test_live_retrieval.py
"""

import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from app.db.session import get_engine, get_sessionmaker
from app.retrieval.base import RetrievalMode, SearchFilters
from app.retrieval.service import RetrievalService
from app.services.documents import DocumentService

pytestmark = [pytest.mark.ollama, pytest.mark.integration]

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module", autouse=True)
def apply_migrations():
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
async def dispose_engine():
    yield
    await get_engine().dispose()


async def test_live_index_and_search():
    marker = uuid.uuid4().hex
    case_id = f"case-live-{marker[:12]}"
    text = (
        f"Espresso machine descaling manual {marker}.\n\n"
        "Descale the espresso machine boiler every three months using citric acid. "
        "The warranty is void if limescale damages the heating element."
    )
    async with get_sessionmaker()() as session:
        outcome = await DocumentService(session).upload(
            data=text.encode("utf-8"),
            filename="descaling_manual.txt",
            document_type="other",
            case_id=case_id,
        )
    document_id = outcome.document.id
    try:
        service = RetrievalService()
        indexed = await service.index_document(document_id)
        assert indexed >= 1

        filters = SearchFilters(case_id=case_id)
        for mode in (RetrievalMode.DENSE, RetrievalMode.HYBRID):
            results = await service.search(
                "How often should the espresso machine be descaled?",
                mode=mode,
                top_k=3,
                filters=filters,
            )
            assert results, mode
            assert results[0].document_id == document_id
            assert results[0].mode is mode
    finally:
        async with get_sessionmaker()() as session:
            await DocumentService(session).delete_document(document_id)
