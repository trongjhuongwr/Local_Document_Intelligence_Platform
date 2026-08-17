"""Provider-agnostic LLM interfaces and the result/telemetry models they return."""

from typing import Protocol, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMTelemetry(BaseModel):
    """Observability metadata captured for every LLM call.

    Durations are milliseconds; token counts come from the provider's response
    metadata and may be absent if the provider did not report them.
    """

    model: str
    prompt_name: str | None = None
    prompt_version: str | None = None
    temperature: float
    input_token_count: int | None = None
    output_token_count: int | None = None
    prompt_eval_duration_ms: float | None = None
    generation_duration_ms: float | None = None
    total_duration_ms: float | None = None
    retry_count: int = 0
    schema_valid: bool | None = None
    success: bool


class LLMResult(BaseModel):
    """A free-form generation result paired with its telemetry."""

    text: str
    telemetry: LLMTelemetry


class LLMProvider(Protocol):
    """Structural interface implemented by all LLM providers."""

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
        """Generate free-form text for ``prompt`` and return it with telemetry."""
        ...

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
        """Generate output validated against ``schema``, retrying on invalid output."""
        ...
