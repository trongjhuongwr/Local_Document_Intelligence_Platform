# Model comparison: `llama3.2:1b` vs `llama3.2:3b`

Both runs: `python -m evals.run_all --cases 15` against the same DocFlowBench corpus, same prompts, same hardware (Ryzen 5 6600H · 16 GB RAM · RTX 3050 4 GB), on 2026-08-26. The only variable changed was `OLLAMA_LLM_MODEL`.

## Results

| Metric | `llama3.2:1b` | `llama3.2:3b` | Change |
|---|---|---|---|
| **Extraction** — field accuracy | 97.52% | **99.77%** | +2.25 pts |
| **Extraction** — invoice fields | 96.08% | **99.51%** | +3.43 pts |
| **Extraction** — schema validity | 100% | 100% | — |
| **Discrepancy end-to-end** — precision | 63.16% | **100%** | +36.84 pts |
| **Discrepancy end-to-end** — recall | 85.71% | **92.86%** | +7.15 pts |
| **Discrepancy end-to-end** — F1 | 0.727 | **0.963** | +0.236 |
| **Citations** — valid rate | 90.00% | **100%** | +10 pts |
| **Citations** — correct document | 81.67% | **98.33%** | +16.66 pts |
| **Routing** — LLM-only accuracy | 67.50% | 82.50% | +15 pts |
| Discrepancy rules (perfect extraction) | F1 1.00 | F1 1.00 | unchanged |
| Retrieval (BM25 Recall@5) | 0.93 | 0.93 | unchanged |
| Workflow completion | 15/15 | 15/15 | unchanged |

### Latency cost

| Measure | `1b` | `3b` | Slowdown |
|---|---|---|---|
| Extraction, median per document | 1,623 ms | 3,126 ms | **1.93×** |
| Grounded Q&A, median | 812 ms | 1,164 ms | 1.43× |
| Grounded Q&A, p95 | 964 ms | 1,537 ms | 1.59× |
| Full case analysis, median | 11.2 s | 12.8 s | **1.14×** |

Per-document extraction nearly doubles, but a full case analysis slows by only 14% — extraction is one stage among several, and the deterministic stages are unaffected.

Disk/VRAM: 1.3 GB vs 2.0 GB. Both fit the 4 GB card alongside the 45 MB embedding model.

## What the numbers say

**1. The 3B model eliminated every false positive.** End-to-end went from 12 TP / 7 FP / 2 FN to **13 TP / 0 FP / 1 FN**. The seven surviving false alarms in the 1B run traced to misread `subtotal` / `tax` / `total` values; the larger model transcribes them correctly.

**2. Three of the seven evaluations did not move at all.** The discrepancy rules, retrieval, and workflow completion are identical, because no LLM participates in them. Most of this system is immune to the model choice — which is the architectural point, stated as a measurement rather than a claim.

**3. The deterministic router survives the upgrade.** LLM-only routing improved from 67.5% to 82.5%, but keyword rules still score **92.5%**. The decision to keep routing deterministic holds regardless of model size, which makes it a robust decision rather than a workaround for a weak model.

**4. Not every 1B failure was a model failure.** Before this comparison, `tax_rate_percent` extracted at 47.1% — and the fix was removing a misleading example from the prompt, not changing the model (the same 1B model then scored 100% on that field). The residual errors *were* genuine capacity limits. Distinguishing the two mattered: had the model been upgraded first, the prompt bug would have been masked rather than fixed.

## Limitations of this comparison

- **Single run, small sample.** 15 cases, 14 ground-truth anomalies, 60 Q&A queries. "100% precision" means 13 findings with 0 false alarms — encouraging, but not a claim that holds at scale. A larger case count would tighten the confidence interval.
- **Synthetic corpus.** DocFlowBench documents are template-generated, so both models see very regular layouts. Real-world documents would likely widen the gap in favour of the larger model.
- **Prompts were tuned against the 1B model.** The 3B model inherits prompts written to work around 1B weaknesses; a prompt set written for 3B might do better still.
- Latency measured with the model already warm. Cold-start load is longer for the 3B model.

## Reproducing

```bash
export EVAL_DATABASE_URL=postgresql+asyncpg://docintel:docintel@localhost:5433/docintel_eval
OLLAMA_LLM_MODEL=llama3.2:1b python -m evals.run_all --cases 15
OLLAMA_LLM_MODEL=llama3.2:3b python -m evals.run_all --cases 15
```

Reports are written to `evals/reports/` and name the model that produced them.
