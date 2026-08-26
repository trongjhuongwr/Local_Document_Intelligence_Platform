# Evaluation Summary

- Discrepancy rules (perfect extraction): F1 **100.00%** over 15 cases
- Extraction (llama3.2:1b): field accuracy **95.72%**, schema validity **100.00%**
- Discrepancy end-to-end (LLM extraction): precision **52.17%**, recall **85.71%**, F1 **64.86%**
- Retrieval: BM25 recommended: Recall@5 0.93, MRR 0.70, 18 ms; hybrid Recall@5 0.88, MRR 0.58, 520 ms
- Routing: routing accuracy 92.50% (deterministic default); LLM-assisted 82.50%, LLM-only 67.50%
- Generation: citations present 90%, valid 90%, correct document 82% over 60 queries
- Workflow: workflow completion 15/15, review-task creation consistency 100%

Detailed per-eval reports live next to this file as `*_latest.{json,md}`.
