# Evaluation Summary

- Discrepancy rules (perfect extraction): F1 **100.00%** over 15 cases
- Extraction (llama3.2:1b): field accuracy **96.62%**, schema validity **100.00%**
- Discrepancy end-to-end (LLM extraction): precision **54.55%**, recall **85.71%**, F1 **66.67%**
- Retrieval: hybrid Recall@5 0.93 vs bm25 0.93 / dense 0.65
- Routing: routing accuracy 92.50% (deterministic default); LLM-assisted 82.50%, LLM-only 67.50%
- Workflow: workflow completion 15/15, review-task creation accuracy 100%

Skipped:
- generation (failed: OllamaUnavailableError: Cannot reach Ollama at http://localhost:11434: )

Detailed per-eval reports live next to this file as `*_latest.{json,md}`.
