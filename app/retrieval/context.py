"""Context budgeting: a small, deduplicated, capped evidence set beats a big one.

Enforces maximum chunk count and character budget, deduplicates identical or
same-chunk content, and reports the final context size for telemetry.
"""

from pydantic import BaseModel

from app.core.logging import get_logger
from app.retrieval.base import RetrievedChunk

logger = get_logger(__name__)


class ContextBudget(BaseModel):
    max_chunks: int = 6
    max_chars: int = 6_000


class BuiltContext(BaseModel):
    chunks: list[RetrievedChunk]
    total_chars: int
    dropped_duplicates: int
    dropped_over_budget: int


def build_context(
    candidates: list[RetrievedChunk], budget: ContextBudget | None = None
) -> BuiltContext:
    budget = budget or ContextBudget()
    selected: list[RetrievedChunk] = []
    seen_chunk_ids = set()
    seen_texts = set()
    total_chars = 0
    dropped_duplicates = 0
    dropped_over_budget = 0

    for chunk in candidates:
        normalized_text = " ".join(chunk.text.split())
        if chunk.chunk_id in seen_chunk_ids or normalized_text in seen_texts:
            dropped_duplicates += 1
            continue
        if len(selected) >= budget.max_chunks or total_chars + len(chunk.text) > budget.max_chars:
            dropped_over_budget += 1
            continue
        selected.append(chunk)
        seen_chunk_ids.add(chunk.chunk_id)
        seen_texts.add(normalized_text)
        total_chars += len(chunk.text)

    logger.info(
        "context_built",
        selected=len(selected),
        total_chars=total_chars,
        dropped_duplicates=dropped_duplicates,
        dropped_over_budget=dropped_over_budget,
    )
    return BuiltContext(
        chunks=selected,
        total_chars=total_chars,
        dropped_duplicates=dropped_duplicates,
        dropped_over_budget=dropped_over_budget,
    )
