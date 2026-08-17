"""Ollama-backed embedding provider using the batched ``/api/embed`` endpoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx

from app.core.config import Settings, get_settings
from app.core.exceptions import EmbeddingError, OllamaUnavailableError
from app.core.logging import get_logger

logger = get_logger(__name__)


class OllamaEmbeddingProvider:
    """Embedding provider backed by a local Ollama server.

    Error mapping (consistent across all methods): connectivity failures
    (connection refused, timeouts, other transport errors) raise
    :class:`OllamaUnavailableError`; every other failure (non-2xx responses,
    malformed payloads, vector count or dimension mismatches) raises
    :class:`EmbeddingError`.

    Inputs are embedded in batches of ``batch_size`` (default 32) via multiple
    requests when needed, preserving input order. ``dimension`` is ``None``
    until the first successful call, then reflects the vector dimensionality.

    An ``httpx.AsyncClient`` may be injected for testing; the injected client is
    never closed by this class. Without injection, a client is created per call
    using the configured timeout.
    """

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        client: httpx.AsyncClient | None = None,
        batch_size: int = 32,
    ) -> None:
        if batch_size < 1:
            raise ValueError("batch_size must be >= 1")
        self._settings = settings or get_settings()
        self._client = client
        self._batch_size = batch_size
        self._dimension: int | None = None

    @property
    def dimension(self) -> int | None:
        """Vector dimensionality observed on the first successful call, else None."""
        return self._dimension

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed document texts in batches, preserving order. Empty input yields []."""
        if not texts:
            return []
        vectors: list[list[float]] = []
        async with self._acquire_client() as client:
            for start in range(0, len(texts), self._batch_size):
                batch = texts[start : start + self._batch_size]
                vectors.extend(await self._embed_batch(client, batch))
        logger.debug(
            "embeddings_generated",
            model=self._settings.ollama_embedding_model,
            text_count=len(texts),
            dimension=self._dimension,
        )
        return vectors

    async def embed_query(self, text: str) -> list[float]:
        """Embed a single query string."""
        async with self._acquire_client() as client:
            [vector] = await self._embed_batch(client, [text])
        return vector

    @asynccontextmanager
    async def _acquire_client(self) -> AsyncIterator[httpx.AsyncClient]:
        if self._client is not None:
            yield self._client
            return
        timeout = httpx.Timeout(self._settings.ollama_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            yield client

    async def _embed_batch(
        self, client: httpx.AsyncClient, batch: list[str]
    ) -> list[list[float]]:
        url = f"{self._settings.ollama_base_url.rstrip('/')}/api/embed"
        payload = {"model": self._settings.ollama_embedding_model, "input": batch}
        try:
            response = await client.post(url, json=payload)
        except httpx.TransportError as exc:
            raise OllamaUnavailableError(
                f"Cannot reach Ollama at {self._settings.ollama_base_url}: {exc}",
                details={"url": url},
            ) from exc
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise EmbeddingError(
                f"Ollama embedding request failed with HTTP {exc.response.status_code}",
                details={"url": url, "body": exc.response.text[:500]},
            ) from exc
        data: dict[str, Any] = response.json()
        embeddings = data.get("embeddings")
        if not isinstance(embeddings, list) or len(embeddings) != len(batch):
            got = len(embeddings) if isinstance(embeddings, list) else None
            raise EmbeddingError(
                "Ollama returned an unexpected embeddings payload",
                details={"expected_count": len(batch), "received_count": got},
            )
        for vector in embeddings:
            if not isinstance(vector, list) or not vector:
                raise EmbeddingError(
                    "Ollama returned an empty or non-list embedding vector",
                    details={"expected_dimension": self._dimension},
                )
            if self._dimension is None:
                self._dimension = len(vector)
            elif len(vector) != self._dimension:
                raise EmbeddingError(
                    "Ollama returned embedding vectors with inconsistent dimensions",
                    details={"expected_dimension": self._dimension, "received": len(vector)},
                )
        return embeddings
