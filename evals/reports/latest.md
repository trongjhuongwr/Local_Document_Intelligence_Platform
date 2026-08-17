# Evaluation Summary

- Discrepancy rules (perfect extraction): F1 **100.00%** over 10 cases
- Extraction (llama3.2:1b): field accuracy **11.51%**, schema validity **100.00%**
- Discrepancy end-to-end (LLM extraction): precision **0.00%**, recall **0.00%**, F1 **0.00%**
- Retrieval: hybrid Recall@5 0.95 vs bm25 0.95 / dense 0.82
- Routing: routing accuracy 92.50% (deterministic default); LLM-assisted 82.50%, LLM-only 67.50%
- Workflow: workflow completion 10/10, review-task creation accuracy 100%

Skipped:
- generation (failed: OllamaUnavailableError: Cannot reach Ollama at http://localhost:11434: )

Detailed per-eval reports live next to this file as `*_latest.{json,md}`.
