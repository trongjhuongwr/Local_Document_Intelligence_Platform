"""Query routing: deterministic keyword rules by default, LLM behind a flag.

Measured on the labeled routing eval (evals/routing): keyword rules score
92.5% accuracy, `llama3.2:1b` scores 20% zero-shot and 67.5% few-shot, and a
keyword-first-then-LLM composite scores 82.5% — the LLM *lowers* accuracy on
this closed domain. Production routing is therefore purely deterministic
unless ROUTER_LLM_ENABLED=true, and always degrades to factual RAG instead of
breaking.
"""

from enum import StrEnum

from pydantic import BaseModel

from app.core.config import get_settings
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
    method: str  # "keyword" | "llm" | "fallback"


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


def keyword_route(query: str) -> tuple[QueryRoute, bool]:
    """Deterministic keyword classification; second value is True when a rule fired."""
    lowered = query.lower()
    for route, keywords in _FALLBACK_KEYWORDS:
        if any(keyword in lowered for keyword in keywords):
            return route, True
    return QueryRoute.FACTUAL_RAG, False


def fallback_route(query: str) -> QueryRoute:
    """Keyword classification with factual RAG as the no-match default."""
    route, _matched = keyword_route(query)
    return route


class QueryRouter:
    def __init__(
        self,
        provider: LLMProvider,
        registry: PromptRegistry | None = None,
        use_llm: bool | None = None,
    ) -> None:
        self._provider = provider
        self._registry = registry or PromptRegistry()
        self._use_llm = use_llm

    async def classify_llm(self, query: str) -> QueryRoute | None:
        """Constrained LLM classification; None when the call or validation fails."""
        rendered = self._registry.render("routing", 2, query=query)
        try:
            decision, _telemetry = await self._provider.generate_structured(
                rendered.text,
                RouteDecision,
                temperature=0.0,
                max_retries=1,
                prompt_name="routing",
                prompt_version="2",
            )
        except (StructuredOutputValidationError, OllamaUnavailableError) as exc:
            logger.warning("router_llm_failed", error=type(exc).__name__)
            return None
        return decision.route

    async def route(self, query: str) -> RoutingResult:
        route, matched = keyword_route(query)
        if matched:
            return RoutingResult(route=route, method="keyword")
        use_llm = self._use_llm if self._use_llm is not None else get_settings().router_llm_enabled
        if use_llm:
            llm_route = await self.classify_llm(query)
            if llm_route is not None:
                return RoutingResult(route=llm_route, method="llm")
            return RoutingResult(route=QueryRoute.FACTUAL_RAG, method="fallback")
        return RoutingResult(route=QueryRoute.FACTUAL_RAG, method="keyword_default")
