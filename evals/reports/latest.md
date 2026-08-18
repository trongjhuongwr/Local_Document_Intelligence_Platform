# Evaluation Summary

- Discrepancy rules (perfect extraction): F1 **100.00%** over 15 cases
- Extraction (llama3.2:1b): field accuracy **95.27%**, schema validity **100.00%**
- Discrepancy end-to-end (LLM extraction): precision **57.14%**, recall **85.71%**, F1 **68.57%**
- Retrieval: BM25 recommended: Recall@5 0.93, MRR 0.70, 33 ms; hybrid Recall@5 0.93, MRR 0.58, 748 ms
- Routing: routing accuracy 92.50% (deterministic default); LLM-assisted 82.50%, LLM-only 70.00%
- Generation: citations present 88%, valid 88%, correct document 80% over 60 queries
- Workflow: workflow completion 15/15, review-task creation consistency 100%

Source report timestamps:
- discrepancy_rules: 2026-08-18T03:18:07+00:00
- extraction: 2026-08-18T03:21:41+00:00
- discrepancy_end_to_end: 2026-08-18T03:25:10+00:00
- retrieval: 2026-08-18T03:44:46+00:00
- routing: 2026-08-18T03:27:49+00:00
- generation: 2026-08-18T03:36:29+00:00
- workflow: 2026-08-18T03:48:38+00:00

Detailed per-eval reports live next to this file as `*_latest.{json,md}`.
