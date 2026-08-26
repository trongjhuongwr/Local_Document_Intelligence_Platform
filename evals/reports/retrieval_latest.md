# Retrieval Evaluation (DocFlowBench)

Embedding model: `all-minilm` · Cases: 15 · Queries: 60 · top_k: 10

**BM25 recommended: Recall@5 0.93, MRR 0.70, 16 ms; hybrid Recall@5 0.88, MRR 0.58, 618 ms**

Production default: **BM25**. BM25 ties hybrid on Recall@5 while producing better Recall@1, MRR, nDCG@5, and mean latency on this benchmark.

| Mode | Recall@1 | Recall@3 | Recall@5 | MRR | nDCG@5 | Mean latency (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| bm25 | 0.58 | 0.75 | 0.93 | 0.70 | 0.34 | 16 |
| dense | 0.23 | 0.48 | 0.65 | 0.41 | 0.17 | 663 |
| hybrid | 0.42 | 0.70 | 0.88 | 0.58 | 0.27 | 618 |
