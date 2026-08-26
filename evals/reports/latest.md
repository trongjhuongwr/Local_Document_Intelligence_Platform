# Evaluation Summary

- Discrepancy rules (perfect extraction): F1 **100.00%** over 15 cases
- Extraction (llama3.2:1b): field accuracy **97.52%**, schema validity **100.00%**
- Discrepancy end-to-end (LLM extraction): precision **63.16%**, recall **85.71%**, F1 **72.73%**
- Retrieval: BM25 recommended: Recall@5 0.93, MRR 0.70, 17 ms; hybrid Recall@5 0.88, MRR 0.58, 548 ms
- Routing: routing accuracy 92.50% (deterministic default); LLM-assisted 82.50%, LLM-only 67.50%
- Generation: citations present 90%, valid 90%, correct document 82% over 60 queries
- Workflow: workflow completion 15/15, review-task creation consistency 100%

Detailed per-eval reports live next to this file as `*_latest.{json,md}`.
