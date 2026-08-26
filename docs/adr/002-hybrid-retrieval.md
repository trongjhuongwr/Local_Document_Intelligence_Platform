# ADR 002 — Hybrid retrieval (BM25 + dense + RRF)

## Status

Accepted (2026-08-18)

## Context

Business-document queries mix two shapes: exact identifiers ("INV-2025-83614", "Net 30") where lexical match wins, and semantic questions ("what is the spending cap?") where embeddings win. A 1B generation model cannot compensate for weak retrieval, so retrieval quality is the ceiling of answer quality.

## Decision

Implement BM25 (rank-bm25, in-process), dense retrieval (all-minilm embeddings in pgvector), and Reciprocal Rank Fusion (`RRF(d) = Σ 1/(k + rank_i(d))`, k=60) as measured retrieval modes. Fusion is deterministic Python — the LLM never merges rankings. An optional CPU cross-encoder reranker sits behind `ENABLE_RERANKER=false`.

Use **BM25 as the production default** for the current release. On the 15-case DocFlowBench run it tied hybrid at Recall@5 (0.93), while producing better Recall@1, MRR, nDCG@5, and mean latency (33 ms versus 748 ms). Dense and hybrid remain explicit options for semantic-query experiments; they do not become the default until measurements justify the trade-off.

## Alternatives considered

- **Dense-only:** misses exact invoice/PO numbers and rare tokens — unacceptable for financial documents.
- **BM25-only:** misses paraphrases ("spending cap" vs "maximum aggregate fees").
- **Elasticsearch/OpenSearch:** real BM25 at scale, but a heavyweight service the 16 GB budget cannot afford; benchmark-sized corpora fit in-process BM25 fine.
- **LLM-based rank fusion:** non-deterministic, slow, and unnecessary — RRF is two lines of arithmetic.

## Consequences

- Recall@K / MRR / nDCG and latency are measured per mode in `evals/retrieval`; the selected default follows those measurements rather than the architecture's novelty.
- BM25 index rebuilds per corpus change; acceptable at benchmark scale and documented as a known limitation for larger corpora.
- Hybrid remains available for future embedding, weighting, and reranking improvements.
