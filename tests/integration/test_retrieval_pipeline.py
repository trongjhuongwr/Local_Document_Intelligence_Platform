"""Integration tests for indexing and retrieval against a live PostgreSQL.

Uses a deterministic hash-based fake embedding provider (no Ollama needed):
texts sharing tokens get nearby vectors, so dense retrieval behaves like a
crude semantic search.
"""

import hashlib
import itertools
import math
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from app.core.config import Settings
from app.core.exceptions import OllamaUnavailableError
from app.db.session import get_engine, get_sessionmaker
from app.embeddings.ollama import OllamaEmbeddingProvider
from app.models.embedding import EMBEDDING_DIMENSION
from app.retrieval.base import RetrievalMode, RetrievedChunk, SearchFilters
from app.retrieval.bm25 import tokenize
from app.retrieval.indexer import ChunkIndexer
from app.retrieval.service import RetrievalService
from app.retrieval.vector import DenseRetriever
from app.services.documents import DocumentService

pytestmark = pytest.mark.integration

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module", autouse=True)
def apply_migrations():
    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))
    command.upgrade(config, "head")


@pytest.fixture(autouse=True)
async def dispose_engine():
    # Each test runs in its own event loop; dispose pooled asyncpg connections
    # afterwards so the next loop starts clean.
    yield
    await get_engine().dispose()


def fake_vector(text: str) -> list[float]:
    """Deterministic bag-of-hashed-tokens vector, L2-normalised."""
    vector = [0.0] * EMBEDDING_DIMENSION
    for token in tokenize(text):
        digest = hashlib.md5(token.encode("utf-8")).digest()
        vector[int.from_bytes(digest[:4], "big") % EMBEDDING_DIMENSION] += 1.0
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


class FakeEmbeddingProvider:
    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [fake_vector(text) for text in texts]

    async def embed_query(self, text: str) -> list[float]:
        return fake_vector(text)


async def _upload(text: str, filename: str, document_type: str, case_id: str) -> uuid.UUID:
    async with get_sessionmaker()() as session:
        outcome = await DocumentService(session).upload(
            data=text.encode("utf-8"),
            filename=filename,
            document_type=document_type,
            case_id=case_id,
        )
    assert outcome.chunk_count >= 1
    return outcome.document.id


async def _delete(document_id: uuid.UUID) -> None:
    async with get_sessionmaker()() as session:
        await DocumentService(session).delete_document(document_id)


async def test_index_and_search_all_modes():
    marker = uuid.uuid4().hex
    case_id = f"case-retrieval-{marker[:12]}"
    solar_id = await _upload(
        f"Solar panel installation guide {marker}.\n\n"
        "The rooftop solar panel warranty covers inverter defects for ten years. "
        "Solar output degrades slowly over the warranty period.",
        "solar_guide.txt",
        "other",
        case_id,
    )
    invoice_id = await _upload(
        f"Billing record {marker}.\n\n"
        "Invoice INV-2025-83614 issued by Acme Corp. Total due 4200 USD "
        "payable within net-30 terms. Purchase order PO-7788 referenced.",
        "invoice_fake.txt",
        "invoice",
        case_id,
    )
    try:
        service = RetrievalService(
            embedding_provider=FakeEmbeddingProvider(), model_name="fake-hash"
        )
        filters = SearchFilters(case_id=case_id)

        assert await service.index_document(solar_id) >= 1
        assert await service.index_document(invoice_id) >= 1
        # Idempotent: nothing left to embed on a second pass.
        assert await service.index_document(solar_id) == 0
        assert await service.index_document(invoice_id) == 0

        dense = await service.search(
            "solar panel warranty", mode=RetrievalMode.DENSE, top_k=5, filters=filters
        )
        assert dense
        assert dense[0].document_id == solar_id
        assert dense[0].mode is RetrievalMode.DENSE
        assert [chunk.rank for chunk in dense] == list(range(1, len(dense) + 1))

        bm25 = await service.search(
            "invoice INV-2025-83614", mode=RetrievalMode.BM25, top_k=5, filters=filters
        )
        assert bm25
        assert bm25[0].document_id == invoice_id
        assert bm25[0].mode is RetrievalMode.BM25
        assert "INV-2025-83614" in bm25[0].text

        hybrid = await service.search(
            "total due on invoice INV-2025-83614",
            mode=RetrievalMode.HYBRID,
            top_k=5,
            filters=filters,
        )
        assert hybrid
        assert all(isinstance(chunk, RetrievedChunk) for chunk in hybrid)
        assert all(chunk.mode is RetrievalMode.HYBRID for chunk in hybrid)
        assert [chunk.rank for chunk in hybrid] == list(range(1, len(hybrid) + 1))
        assert all(a.score >= b.score for a, b in itertools.pairwise(hybrid))
        assert hybrid[0].document_id == invoice_id
    finally:
        await _delete(solar_id)
        await _delete(invoice_id)


async def test_filters_scope_results():
    marker = uuid.uuid4().hex
    case_a = f"case-a-{marker[:12]}"
    case_b = f"case-b-{marker[:12]}"
    doc_a = await _upload(
        f"Quarterly maintenance report {marker} covering turbine lubrication schedules.",
        "report_a.txt",
        "other",
        case_a,
    )
    doc_b = await _upload(
        f"Quarterly maintenance summary {marker} covering turbine lubrication budgets.",
        "report_b.txt",
        "other",
        case_b,
    )
    try:
        indexer = ChunkIndexer(FakeEmbeddingProvider(), get_sessionmaker(), model_name="fake-hash")
        await indexer.index_document(doc_a)
        await indexer.index_document(doc_b)
        service = RetrievalService(
            embedding_provider=FakeEmbeddingProvider(), model_name="fake-hash"
        )
        for mode in (RetrievalMode.BM25, RetrievalMode.DENSE, RetrievalMode.HYBRID):
            results = await service.search(
                "turbine lubrication",
                mode=mode,
                top_k=10,
                filters=SearchFilters(case_id=case_a),
            )
            assert results, mode
            assert {chunk.document_id for chunk in results} == {doc_a}
    finally:
        await _delete(doc_a)
        await _delete(doc_b)


async def test_dense_raises_when_ollama_down_but_bm25_works():
    marker = uuid.uuid4().hex
    case_id = f"case-down-{marker[:12]}"
    doc_id = await _upload(
        f"Outage drill document {marker} mentioning firewall maintenance windows.",
        "outage.txt",
        "other",
        case_id,
    )
    try:
        unreachable = OllamaEmbeddingProvider(
            settings=Settings(
                ollama_base_url="http://127.0.0.1:9",
                ollama_timeout_seconds=2.0,
            )
        )
        dense = DenseRetriever(unreachable, get_sessionmaker())
        with pytest.raises(OllamaUnavailableError):
            await dense.search("firewall maintenance", top_k=3)

        service = RetrievalService(embedding_provider=unreachable)
        with pytest.raises(OllamaUnavailableError):
            await service.search("firewall maintenance", mode=RetrievalMode.HYBRID, top_k=3)

        bm25 = await service.search(
            "firewall maintenance",
            mode=RetrievalMode.BM25,
            top_k=3,
            filters=SearchFilters(case_id=case_id),
        )
        assert bm25
        assert bm25[0].document_id == doc_id
    finally:
        await _delete(doc_id)
