"""Reciprocal rank fusion (RRF) for combining rankings from multiple retrievers."""

from app.retrieval.base import RetrievalMode, RetrievedChunk


def reciprocal_rank_fusion(
    rankings: list[list[RetrievedChunk]],
    *,
    k: int = 60,
    top_k: int = 10,
) -> list[RetrievedChunk]:
    """Fuse rankings with RRF: score(chunk) = sum over rankings of 1 / (k + rank).

    Ranks are the 1-based positions within each input ranking. The fused output
    is deterministic — ties are broken by chunk_id hex — and re-labelled with
    ``mode=hybrid``, the RRF score, and fresh 1-based ranks.
    """
    scores: dict[str, float] = {}
    representatives: dict[str, RetrievedChunk] = {}
    for ranking in rankings:
        for position, chunk in enumerate(ranking, start=1):
            key = chunk.chunk_id.hex
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + position)
            representatives.setdefault(key, chunk)

    fused_order = sorted(scores, key=lambda key: (-scores[key], key))
    return [
        representatives[key].model_copy(
            update={"score": scores[key], "rank": rank, "mode": RetrievalMode.HYBRID}
        )
        for rank, key in enumerate(fused_order[:top_k], start=1)
    ]
