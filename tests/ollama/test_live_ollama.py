"""Live smoke tests against a locally running Ollama server.

Run with: pytest -m ollama
Requires models: llama3.2:3b (LLM) and all-minilm (embeddings).
"""

import pytest
from pydantic import BaseModel

from app.embeddings.ollama import OllamaEmbeddingProvider
from app.llm.ollama import OllamaLLMProvider

pytestmark = pytest.mark.ollama


class Answer(BaseModel):
    value: int


async def test_live_generate_smoke():
    provider = OllamaLLMProvider()
    result = await provider.generate("Reply with exactly: pong", temperature=0.0, max_tokens=16)

    assert "pong" in result.text.lower()
    telemetry = result.telemetry
    assert telemetry.success is True
    assert telemetry.input_token_count and telemetry.input_token_count > 0
    assert telemetry.output_token_count and telemetry.output_token_count > 0
    assert telemetry.total_duration_ms and telemetry.total_duration_ms > 0


async def test_live_generate_structured():
    provider = OllamaLLMProvider()
    parsed, telemetry = await provider.generate_structured(
        "Return JSON with value=42", Answer, temperature=0.0, max_retries=2
    )

    assert parsed.value == 42
    assert telemetry.schema_valid is True
    assert telemetry.success is True


async def test_live_embed_two_texts():
    provider = OllamaEmbeddingProvider()
    vectors = await provider.embed_documents(["hello world", "local document intelligence"])

    assert len(vectors) == 2
    assert len(vectors[0]) == len(vectors[1]) > 0
    assert provider.dimension == len(vectors[0])
