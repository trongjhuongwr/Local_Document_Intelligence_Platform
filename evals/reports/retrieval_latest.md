# Retrieval Evaluation (DocFlowBench)

Embedding model: `all-minilm` · Cases: 15 · Queries: 60 · top_k: 10

**hybrid Recall@5 0.93 vs bm25 0.93 / dense 0.65**

| Mode | Recall@1 | Recall@3 | Recall@5 | MRR | nDCG@5 | Mean latency (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| bm25 | 0.58 | 0.75 | 0.93 | 0.70 | 0.34 | 36 |
| dense | 0.23 | 0.48 | 0.65 | 0.41 | 0.17 | 856 |
| hybrid | 0.40 | 0.70 | 0.93 | 0.58 | 0.28 | 851 |
