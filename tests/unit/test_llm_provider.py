"""Unit tests for OllamaLLMProvider (mocked transport) and the PromptRegistry."""

import json
from collections.abc import Callable

import httpx
import pytest
from pydantic import BaseModel

from app.core.config import Settings
from app.core.exceptions import OllamaUnavailableError, StructuredOutputValidationError
from app.llm.ollama import OllamaLLMProvider
from app.llm.prompts.registry import PromptRegistry


class Answer(BaseModel):
    value: int


def _settings() -> Settings:
    return Settings(
        ollama_base_url="http://mock-ollama:11434",
        ollama_llm_model="test-llm",
        ollama_num_ctx=2048,
        ollama_timeout_seconds=5.0,
    )


def _chat_response(content: str) -> dict:
    return {
        "model": "test-llm",
        "created_at": "2026-08-18T00:00:00Z",
        "message": {"role": "assistant", "content": content},
        "done": True,
        "done_reason": "stop",
        "total_duration": 2_000_000_000,
        "load_duration": 100_000_000,
        "prompt_eval_count": 12,
        "prompt_eval_duration": 250_000_000,
        "eval_count": 34,
        "eval_duration": 1_500_000_000,
    }


def _provider(handler: Callable[[httpx.Request], httpx.Response]) -> OllamaLLMProvider:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return OllamaLLMProvider(settings=_settings(), client=client)


class TestGenerate:
    async def test_returns_text_and_maps_telemetry_ns_to_ms(self):
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(200, json=_chat_response("hello world"))

        provider = _provider(handler)
        result = await provider.generate(
            "Say hello",
            system="You are terse.",
            temperature=0.2,
            max_tokens=64,
            prompt_name="summarization",
            prompt_version="1",
        )

        assert result.text == "hello world"
        telemetry = result.telemetry
        assert telemetry.model == "test-llm"
        assert telemetry.prompt_name == "summarization"
        assert telemetry.prompt_version == "1"
        assert telemetry.temperature == 0.2
        assert telemetry.input_token_count == 12
        assert telemetry.output_token_count == 34
        assert telemetry.prompt_eval_duration_ms == 250.0
        assert telemetry.generation_duration_ms == 1500.0
        assert telemetry.total_duration_ms == 2000.0
        assert telemetry.retry_count == 0
        assert telemetry.schema_valid is None
        assert telemetry.success is True

    async def test_sends_expected_chat_payload(self):
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(200, json=_chat_response("ok"))

        provider = _provider(handler)
        await provider.generate(
            "Say hello", system="You are terse.", temperature=0.2, max_tokens=64
        )

        assert len(requests) == 1
        assert requests[0].url == "http://mock-ollama:11434/api/chat"
        body = json.loads(requests[0].content)
        assert body["model"] == "test-llm"
        assert body["stream"] is False
        assert body["messages"] == [
            {"role": "system", "content": "You are terse."},
            {"role": "user", "content": "Say hello"},
        ]
        assert body["options"] == {"temperature": 0.2, "num_ctx": 2048, "num_predict": 64}
        assert "format" not in body

    async def test_missing_metadata_yields_none_telemetry_fields(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200, json={"message": {"role": "assistant", "content": "hi"}, "done": True}
            )

        provider = _provider(handler)
        result = await provider.generate("hello")

        assert result.telemetry.input_token_count is None
        assert result.telemetry.output_token_count is None
        assert result.telemetry.total_duration_ms is None

    async def test_connection_error_maps_to_ollama_unavailable(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        provider = _provider(handler)
        with pytest.raises(OllamaUnavailableError):
            await provider.generate("hello")

    async def test_timeout_maps_to_ollama_unavailable(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ReadTimeout("timed out")

        provider = _provider(handler)
        with pytest.raises(OllamaUnavailableError):
            await provider.generate("hello")

    async def test_http_error_status_maps_to_ollama_unavailable(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="internal error")

        provider = _provider(handler)
        with pytest.raises(OllamaUnavailableError):
            await provider.generate("hello")


class TestGenerateStructured:
    async def test_invalid_then_valid_response_retries_once(self):
        calls: list[dict] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(json.loads(request.content))
            if len(calls) == 1:
                return httpx.Response(200, json=_chat_response("not json at all"))
            return httpx.Response(200, json=_chat_response('{"value": 42}'))

        provider = _provider(handler)
        parsed, telemetry = await provider.generate_structured(
            "Give the answer", Answer, max_retries=1
        )

        assert parsed == Answer(value=42)
        assert telemetry.retry_count == 1
        assert telemetry.schema_valid is True
        assert telemetry.success is True
        assert len(calls) == 2
        # Every request carries the JSON schema as Ollama's structured-output format.
        assert calls[0]["format"] == Answer.model_json_schema()
        assert calls[1]["format"] == Answer.model_json_schema()
        # The retry appends the bad output and a corrective user message.
        roles = [message["role"] for message in calls[1]["messages"]]
        assert roles == ["user", "assistant", "user"]
        assert calls[1]["messages"][1]["content"] == "not json at all"
        assert "not valid JSON" in calls[1]["messages"][2]["content"]

    async def test_all_invalid_responses_raise_structured_output_error(self):
        call_count = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            return httpx.Response(200, json=_chat_response("still not json"))

        provider = _provider(handler)
        with pytest.raises(StructuredOutputValidationError) as excinfo:
            await provider.generate_structured("Give the answer", Answer, max_retries=1)

        assert call_count == 2
        details = excinfo.value.details
        assert details["schema"] == "Answer"
        assert "still not json" in details["raw_output_snippet"]
        assert details["validation_error"]

    async def test_wrong_schema_json_raises_with_validation_details(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=_chat_response('{"value": "not an int"}'))

        provider = _provider(handler)
        with pytest.raises(StructuredOutputValidationError) as excinfo:
            await provider.generate_structured("Give the answer", Answer, max_retries=0)

        assert "value" in excinfo.value.details["validation_error"]

    async def test_connection_error_maps_to_ollama_unavailable(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        provider = _provider(handler)
        with pytest.raises(OllamaUnavailableError):
            await provider.generate_structured("Give the answer", Answer)


class TestPromptRegistry:
    def test_render_summarization_prompt(self):
        registry = PromptRegistry()
        rendered = registry.render("summarization", 1, document_text="The sky is blue.")

        assert rendered.name == "summarization"
        assert rendered.version == 1
        assert "The sky is blue." in rendered.text
        assert "{document_text}" not in rendered.text

    def test_missing_variable_raises_value_error(self):
        with pytest.raises(ValueError, match="document_text"):
            PromptRegistry().render("summarization", 1)

    def test_extra_variable_raises_value_error(self):
        with pytest.raises(ValueError, match="unexpected"):
            PromptRegistry().render("summarization", 1, document_text="x", bogus="y")

    def test_unknown_prompt_lists_available(self):
        with pytest.raises(FileNotFoundError, match="summarization_v1"):
            PromptRegistry().render("nonexistent", 3, document_text="x")

    def test_available_prompts_includes_starter(self):
        assert "summarization_v1" in PromptRegistry().available_prompts()
