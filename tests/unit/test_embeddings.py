"""Unit tests for OllamaEmbeddingProvider using a mocked httpx transport."""

import json
from collections.abc import Callable

import httpx
import pytest

from app.core.config import Settings
from app.core.exceptions import EmbeddingError, OllamaUnavailableError
from app.embeddings.ollama import OllamaEmbeddingProvider


def _settings() -> Settings:
    return Settings(
        ollama_base_url="http://mock-ollama:11434",
        ollama_embedding_model="test-embed",
        ollama_timeout_seconds=5.0,
    )


def _provider(
    handler: Callable[[httpx.Request], httpx.Response], batch_size: int = 32
) -> OllamaEmbeddingProvider:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return OllamaEmbeddingProvider(settings=_settings(), client=client, batch_size=batch_size)


def _echo_index_handler(batches: list[list[str]]) -> Callable[[httpx.Request], httpx.Response]:
    """Return each text's numeric suffix as its vector so order is verifiable."""

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        batches.append(body["input"])
        embeddings = [[float(text.split("-")[1]), 0.5] for text in body["input"]]
        return httpx.Response(200, json={"model": "test-embed", "embeddings": embeddings})

    return handler


class TestEmbedDocuments:
    async def test_batches_95_texts_into_3_requests_preserving_order(self):
        batches: list[list[str]] = []
        provider = _provider(_echo_index_handler(batches), batch_size=32)

        texts = [f"text-{i}" for i in range(95)]
        vectors = await provider.embed_documents(texts)

        assert [len(batch) for batch in batches] == [32, 32, 31]
        assert batches[0][0] == "text-0"
        assert batches[2][-1] == "text-94"
        assert vectors == [[float(i), 0.5] for i in range(95)]

    async def test_empty_input_returns_empty_without_requests(self):
        batches: list[list[str]] = []
        provider = _provider(_echo_index_handler(batches))

        assert await provider.embed_documents([]) == []
        assert batches == []
        assert provider.dimension is None

    async def test_sends_expected_payload(self):
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(200, json={"embeddings": [[0.1, 0.2]]})

        provider = _provider(handler)
        await provider.embed_documents(["hello"])

        assert requests[0].url == "http://mock-ollama:11434/api/embed"
        body = json.loads(requests[0].content)
        assert body == {"model": "test-embed", "input": ["hello"]}


class TestEmbedQuery:
    async def test_returns_single_vector(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"embeddings": [[0.1, 0.2, 0.3]]})

        provider = _provider(handler)
        assert await provider.embed_query("hello") == [0.1, 0.2, 0.3]


class TestDimension:
    async def test_none_before_first_call_then_set(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"embeddings": [[0.1, 0.2, 0.3, 0.4]]})

        provider = _provider(handler)
        assert provider.dimension is None
        await provider.embed_query("hello")
        assert provider.dimension == 4

    async def test_inconsistent_dimensions_raise_embedding_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"embeddings": [[0.1, 0.2], [0.1, 0.2, 0.3]]})

        provider = _provider(handler)
        with pytest.raises(EmbeddingError, match="inconsistent"):
            await provider.embed_documents(["a", "b"])


class TestErrorMapping:
    async def test_connection_error_maps_to_ollama_unavailable(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        provider = _provider(handler)
        with pytest.raises(OllamaUnavailableError):
            await provider.embed_documents(["hello"])

    async def test_timeout_maps_to_ollama_unavailable(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("timed out")

        provider = _provider(handler)
        with pytest.raises(OllamaUnavailableError):
            await provider.embed_query("hello")

    async def test_http_error_status_maps_to_embedding_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="model blew up")

        provider = _provider(handler)
        with pytest.raises(EmbeddingError):
            await provider.embed_documents(["hello"])

    async def test_vector_count_mismatch_raises_embedding_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"embeddings": [[0.1, 0.2]]})

        provider = _provider(handler)
        with pytest.raises(EmbeddingError, match="unexpected"):
            await provider.embed_documents(["a", "b"])

    async def test_invalid_batch_size_rejected(self):
        with pytest.raises(ValueError, match="batch_size"):
            OllamaEmbeddingProvider(settings=_settings(), batch_size=0)
