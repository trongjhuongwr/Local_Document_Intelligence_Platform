"""Provider-agnostic embedding interface."""

from typing import Protocol


class EmbeddingProvider(Protocol):
    """Structural interface implemented by all embedding providers."""

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of document texts, preserving input order."""
        ...

    async def embed_query(self, text: str) -> list[float]:
        """Embed a single query string."""
        ...
