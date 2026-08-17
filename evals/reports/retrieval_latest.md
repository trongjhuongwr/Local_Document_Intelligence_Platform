# Retrieval Evaluation (DocFlowBench)

Embedding model: `all-minilm` · Cases: 10 · Queries: 40 · top_k: 10

**hybrid Recall@5 0.95 vs bm25 0.95 / dense 0.82**

| Mode | Recall@1 | Recall@3 | Recall@5 | MRR | nDCG@5 | Mean latency (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| bm25 | 0.60 | 0.82 | 0.95 | 0.72 | 0.37 | 25 |
| dense | 0.25 | 0.60 | 0.82 | 0.46 | 0.22 | 1006 |
| hybrid | 0.53 | 0.82 | 0.95 | 0.67 | 0.32 | 834 |
