"""Query routing: constrained LLM classification with a deterministic fallback.

The model only ever picks one value of a closed enum (enforced by structured
outputs). If the call fails entirely, a keyword-based fallback classifier
keeps the system functional — routing degrades, it never breaks.
"""

from enum import StrEnum

from pydantic import BaseModel

from app.core.exceptions import OllamaUnavailableError, StructuredOutputValidationError
from app.core.logging import get_logger
from app.llm.base import LLMProvider
from app.llm.prompts.registry import PromptRegistry

logger = get_logger(__name__)


class QueryRoute(StrEnum):
    FACTUAL_RAG = "factual_rag"
    STRUCTURED_LOOKUP = "structured_lookup"
    DOCUMENT_COMPARE = "document_compare"
    DISCREPANCY_ANALYSIS = "discrepancy_analysis"
    SUMMARIZATION = "summarization"


class RouteDecision(BaseModel):
    route: QueryRoute


class RoutingResult(BaseModel):
    route: QueryRoute
    method: str  # "llm" or "fallback"


_FALLBACK_KEYWORDS: list[tuple[QueryRoute, tuple[str, ...]]] = [
    (
        QueryRoute.DISCREPANCY_ANALYSIS,
        (
            "discrepan",
            "inconsisten",
            "mismatch",
            "anomal",
            "overbill",
            "exceed",
            "violation",
            "conflict",
        ),
    ),
    (QueryRoute.DOCUMENT_COMPARE, ("compare", "difference between", "differ", "versus", " vs ")),
    (QueryRoute.SUMMARIZATION, ("summar", "overview", "tl;dr", "brief")),
    (
        QueryRoute.STRUCTURED_LOOKUP,
        (
            "total",
            "amount",
            "invoice number",
            "due date",
            "issue date",
            "payment terms",
            "currency",
            "how much",
            "what is the",
        ),
    ),
]


def fallback_route(query: str) -> QueryRoute:
    """Deterministic keyword router used when the LLM is unavailable or invalid."""
    lowered = query.lower()
    for route, keywords in _FALLBACK_KEYWORDS:
        if any(keyword in lowered for keyword in keywords):
            return route
    return QueryRoute.FACTUAL_RAG


class QueryRouter:
    def __init__(self, provider: LLMProvider, registry: PromptRegistry | None = None) -> None:
        self._provider = provider
        self._registry = registry or PromptRegistry()

    async def route(self, query: str) -> RoutingResult:
        rendered = self._registry.render("routing", 1, query=query)
        try:
            decision, _telemetry = await self._provider.generate_structured(
                rendered.text,
                RouteDecision,
                temperature=0.0,
                max_retries=1,
                prompt_name="routing",
                prompt_version="1",
            )
        except (StructuredOutputValidationError, OllamaUnavailableError) as exc:
            route = fallback_route(query)
            logger.warning("router_fallback", error=type(exc).__name__, fallback_route=route.value)
            return RoutingResult(route=route, method="fallback")
        return RoutingResult(route=decision.route, method="llm")
