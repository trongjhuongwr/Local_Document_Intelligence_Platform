"""Hybrid retrieval: run BM25 and dense retrieval concurrently, fuse with RRF."""

import asyncio

from app.core.logging import get_logger
from app.retrieval.base import RetrievedChunk, Retriever, SearchFilters
from app.retrieval.fusion import reciprocal_rank_fusion

logger = get_logger(__name__)


class HybridRetriever:
    """Runs a lexical and a dense retriever concurrently and fuses their rankings.

    Each underlying retriever is asked for ``top_k * candidate_multiplier``
    results so the fusion has a wider candidate pool than the final cutoff.
    """

    def __init__(
        self,
        bm25: Retriever,
        dense: Retriever,
        *,
        rrf_k: int = 60,
        candidate_multiplier: int = 2,
    ) -> None:
        self._bm25 = bm25
        self._dense = dense
        self._rrf_k = rrf_k
        self._candidate_multiplier = max(1, candidate_multiplier)

    async def search(
        self,
        query: str,
        *,
        top_k: int = 10,
        filters: SearchFilters | None = None,
    ) -> list[RetrievedChunk]:
        candidate_k = top_k * self._candidate_multiplier
        bm25_results, dense_results = await asyncio.gather(
            self._bm25.search(query, top_k=candidate_k, filters=filters),
            self._dense.search(query, top_k=candidate_k, filters=filters),
        )
        fused = reciprocal_rank_fusion([bm25_results, dense_results], k=self._rrf_k, top_k=top_k)
        logger.debug(
            "hybrid_search",
            query=query,
            top_k=top_k,
            bm25_count=len(bm25_results),
            dense_count=len(dense_results),
            fused_count=len(fused),
        )
        return fused
