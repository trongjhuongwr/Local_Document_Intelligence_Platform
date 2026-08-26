# Evaluation Summary

- Discrepancy rules (perfect extraction): F1 **100.00%** over 15 cases
- Extraction (llama3.2:3b): field accuracy **99.77%**, schema validity **100.00%**
- Discrepancy end-to-end (LLM extraction): precision **100.00%**, recall **92.86%**, F1 **96.30%**
- Retrieval: BM25 recommended: Recall@5 0.93, MRR 0.70, 16 ms; hybrid Recall@5 0.88, MRR 0.58, 618 ms
- Routing: routing accuracy 92.50% (deterministic default); LLM-assisted 85.00%, LLM-only 82.50%
- Generation: citations present 100%, valid 100%, correct document 98% over 60 queries
- Workflow: workflow completion 15/15, review-task creation consistency 100%

Detailed per-eval reports live next to this file as `*_latest.{json,md}`.
