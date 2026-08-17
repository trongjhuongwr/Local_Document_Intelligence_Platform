# ADR 002 — Hybrid retrieval (BM25 + dense + RRF)

## Status

Accepted (2026-08-18)

## Context

Business-document queries mix two shapes: exact identifiers ("INV-2025-83614", "Net 30") where lexical match wins, and semantic questions ("what is the spending cap?") where embeddings win. A 1B generation model cannot compensate for weak retrieval, so retrieval quality is the ceiling of answer quality.

## Decision

Run BM25 (rank-bm25, in-process) and dense retrieval (all-minilm embeddings in pgvector) in parallel and merge with Reciprocal Rank Fusion (`RRF(d) = Σ 1/(k + rank_i(d))`, k=60). Fusion is deterministic Python — the LLM never merges rankings. An optional CPU cross-encoder reranker sits behind `ENABLE_RERANKER=false` and the system is fully functional without it.

## Alternatives considered

- **Dense-only:** misses exact invoice/PO numbers and rare tokens — unacceptable for financial documents.
- **BM25-only:** misses paraphrases ("spending cap" vs "maximum aggregate fees").
- **Elasticsearch/OpenSearch:** real BM25 at scale, but a heavyweight service the 16 GB budget cannot afford; benchmark-sized corpora fit in-process BM25 fine.
- **LLM-based rank fusion:** non-deterministic, slow, and unnecessary — RRF is two lines of arithmetic.

## Consequences

- Recall@K / MRR / nDCG are measured per mode (BM25, dense, hybrid) in `evals/retrieval`, so the fusion benefit is demonstrated with numbers, not claims.
- BM25 index rebuilds per corpus change; acceptable at benchmark scale and documented as a known limitation for larger corpora.
