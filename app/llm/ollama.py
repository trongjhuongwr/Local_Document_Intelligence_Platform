"""Ollama-backed LLM provider using the non-streaming ``/api/chat`` endpoint."""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.core.exceptions import OllamaUnavailableError, StructuredOutputValidationError
from app.core.logging import get_logger
from app.llm.base import LLMResult, LLMTelemetry, T

logger = get_logger(__name__)

_NS_PER_MS = 1_000_000


def _ns_to_ms(value: int | None) -> float | None:
    return value / _NS_PER_MS if value is not None else None


class OllamaLLMProvider:
    """LLM provider backed by a local Ollama server.

    Connectivity failures (connection refused, timeouts, other transport errors)
    and non-2xx responses are mapped to :class:`OllamaUnavailableError`. Structured
    output that never validates raises :class:`StructuredOutputValidationError`.

    An ``httpx.AsyncClient`` may be injected for testing; the injected client is
    never closed by this class. Without injection, a client is created per call
    using the configured timeout.
    """

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._client = client

    async def generate(
        self,
        prompt: str,
        *,
        system: str | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        prompt_name: str | None = None,
        prompt_version: str | None = None,
    ) -> LLMResult:
        """Generate free-form text via Ollama chat and return it with telemetry."""
        messages = self._build_messages(prompt, system)
        payload = self._build_payload(messages, temperature=temperature, max_tokens=max_tokens)
        async with self._acquire_client() as client:
            data = await self._chat(client, payload)
        text: str = data.get("message", {}).get("content", "")
        telemetry = self._build_telemetry(
            data,
            temperature=temperature,
            prompt_name=prompt_name,
            prompt_version=prompt_version,
            retry_count=0,
            schema_valid=None,
            success=True,
        )
        logger.info("llm_generate", **telemetry.model_dump())
        return LLMResult(text=text, telemetry=telemetry)

    async def generate_structured(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str | None = None,
        temperature: float = 0.0,
        max_retries: int = 1,
        prompt_name: str | None = None,
        prompt_version: str | None = None,
    ) -> tuple[T, LLMTelemetry]:
        """Generate output constrained to ``schema`` via Ollama structured outputs.

        The JSON schema is passed as the ``format`` field so Ollama constrains
        decoding. If the response still fails validation, the model is re-asked
        (up to ``max_retries`` extra attempts) with a corrective message that
        quotes the validation error. Values are never fabricated client-side.
        """
        messages = self._build_messages(prompt, system)
        json_schema = schema.model_json_schema()
        # Require every top-level property in the constrained-decoding grammar.
        # Small models otherwise satisfy an all-optional schema with "{}" —
        # schema-valid but empty. Values stay nullable; only the keys are forced.
        properties = json_schema.get("properties", {})
        if properties:
            json_schema["required"] = list(properties)
        raw_output = ""
        validation_error = ""
        data: dict[str, Any] = {}
        async with self._acquire_client() as client:
            for attempt in range(max_retries + 1):
                payload = self._build_payload(messages, temperature=temperature, max_tokens=None)
                payload["format"] = json_schema
                data = await self._chat(client, payload)
                raw_output = data.get("message", {}).get("content", "")
                try:
                    parsed = schema.model_validate_json(raw_output)
                except (ValidationError, json.JSONDecodeError) as exc:
                    validation_error = str(exc)
                    messages = [
                        *messages,
                        {"role": "assistant", "content": raw_output},
                        {
                            "role": "user",
                            "content": (
                                "Your previous response was not valid JSON for the required "
                                f"schema. Validation error:\n{validation_error}\n"
                                "Respond again with only a JSON object that matches the schema "
                                "exactly. Do not include any other text."
                            ),
                        },
                    ]
                    continue
                telemetry = self._build_telemetry(
                    data,
                    temperature=temperature,
                    prompt_name=prompt_name,
                    prompt_version=prompt_version,
                    retry_count=attempt,
                    schema_valid=True,
                    success=True,
                )
                logger.info("llm_generate_structured", **telemetry.model_dump())
                return parsed, telemetry

        telemetry = self._build_telemetry(
            data,
            temperature=temperature,
            prompt_name=prompt_name,
            prompt_version=prompt_version,
            retry_count=max_retries,
            schema_valid=False,
            success=False,
        )
        logger.warning("llm_generate_structured", **telemetry.model_dump())
        raise StructuredOutputValidationError(
            f"Model output failed validation for schema '{schema.__name__}' "
            f"after {max_retries + 1} attempt(s)",
            details={
                "schema": schema.__name__,
                "validation_error": validation_error,
                "raw_output_snippet": raw_output[:500],
            },
        )

    @asynccontextmanager
    async def _acquire_client(self) -> AsyncIterator[httpx.AsyncClient]:
        if self._client is not None:
            yield self._client
            return
        timeout = httpx.Timeout(self._settings.ollama_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            yield client

    async def _chat(self, client: httpx.AsyncClient, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._settings.ollama_base_url.rstrip('/')}/api/chat"
        try:
            response = await client.post(url, json=payload)
            response.raise_for_status()
        except httpx.TransportError as exc:
            raise OllamaUnavailableError(
                f"Cannot reach Ollama at {self._settings.ollama_base_url}: {exc}",
                details={"url": url},
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise OllamaUnavailableError(
                f"Ollama chat request failed with HTTP {exc.response.status_code}",
                details={"url": url, "body": exc.response.text[:500]},
            ) from exc
        result: dict[str, Any] = response.json()
        return result

    def _build_messages(self, prompt: str, system: str | None) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []
        if system is not None:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return messages

    def _build_payload(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float,
        max_tokens: int | None,
    ) -> dict[str, Any]:
        options: dict[str, float | int] = {
            "temperature": temperature,
            "num_ctx": self._settings.ollama_num_ctx,
        }
        if max_tokens is not None:
            options["num_predict"] = max_tokens
        return {
            "model": self._settings.ollama_llm_model,
            "messages": messages,
            "stream": False,
            "options": options,
        }

    def _build_telemetry(
        self,
        data: dict[str, Any],
        *,
        temperature: float,
        prompt_name: str | None,
        prompt_version: str | None,
        retry_count: int,
        schema_valid: bool | None,
        success: bool,
    ) -> LLMTelemetry:
        return LLMTelemetry(
            model=self._settings.ollama_llm_model,
            prompt_name=prompt_name,
            prompt_version=prompt_version,
            temperature=temperature,
            input_token_count=data.get("prompt_eval_count"),
            output_token_count=data.get("eval_count"),
            prompt_eval_duration_ms=_ns_to_ms(data.get("prompt_eval_duration")),
            generation_duration_ms=_ns_to_ms(data.get("eval_duration")),
            total_duration_ms=_ns_to_ms(data.get("total_duration")),
            retry_count=retry_count,
            schema_valid=schema_valid,
            success=success,
        )
