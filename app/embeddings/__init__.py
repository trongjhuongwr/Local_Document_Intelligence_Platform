"""Embeddings provider layer: provider-agnostic interface plus the Ollama implementation."""

from app.embeddings.base import EmbeddingProvider
from app.embeddings.ollama import OllamaEmbeddingProvider

__all__ = ["EmbeddingProvider", "OllamaEmbeddingProvider"]
