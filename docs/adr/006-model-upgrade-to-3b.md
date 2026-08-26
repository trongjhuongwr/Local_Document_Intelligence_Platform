# ADR 006 — Default generation model moved from `llama3.2:1b` to `llama3.2:3b`

## Status

Accepted (2026-08-26). Partially supersedes the model choice in [ADR 001](001-local-first-llm.md); every other decision in ADR 001 stands.

## Context

ADR 001 chose `llama3.2:1b` as the generation model, both because it fits a 4 GB card comfortably and because a weak model forces the architecture to earn its reliability rather than buy it.

That architecture is now in place and measured: deterministic rules, deterministic routing, software-built citations, Python-computed financial checks. With the pipeline stable, the model became the one remaining variable worth testing — and the evaluation suite makes testing it a single environment variable.

Before this change, end-to-end discrepancy detection sat at precision 63.2% / recall 85.7% / F1 0.73. The seven surviving false positives traced to misread `subtotal`, `tax` and `total` values — genuine transcription failures rather than design bugs, since the design bugs found earlier had already been fixed (see the `tax_rate_percent` regression documented in the README).

## Decision

Default `OLLAMA_LLM_MODEL` to `llama3.2:3b`.

Both models were run through the identical suite — same corpus, same prompts, same hardware — and the results are published in [`docs/model-comparison.md`](../model-comparison.md):

| | `1b` | `3b` |
|---|---|---|
| Extraction field accuracy | 97.52% | 99.77% |
| End-to-end precision | 63.16% | 100% |
| End-to-end recall | 85.71% | 92.86% |
| End-to-end F1 | 0.727 | 0.963 |
| Citations valid | 90% | 100% |
| False positives | 7 | 0 |
| Extraction latency, median | 1,623 ms | 3,126 ms |
| Full case analysis, median | 11.2 s | 12.8 s |

For a tool whose output an auditor must triage, false positives are the dominant usability cost, and the larger model removed all of them on this benchmark. The price — 1.93× per-document extraction latency, but only 1.14× on a complete case analysis — is affordable, and the 2.0 GB model still fits the same 4 GB card alongside the 45 MB embedding model.

## Alternatives considered

- **Keep `1b` to preserve the "small model" narrative.** Rejected. The measurements do not support it, and choosing a worse configuration to protect a story is the kind of dishonesty this repository exists to avoid.
- **Keep `1b` as default and document `3b` as an optional upgrade.** Reasonable, but it leaves the default configuration measurably worse for no benefit the numbers show.
- **Go larger still (7B+).** Does not fit 4 GB VRAM without heavy offload; violates the hardware constraint in ADR 001.

## Consequences

- The local-first constraint is untouched: same laptop, same Ollama host, still no paid API.
- **The architectural thesis is strengthened rather than weakened.** Three of the seven evaluations — discrepancy rules, retrieval, workflow completion — produced *identical* numbers under both models, because no LLM participates in them. The comparison is now evidence for the claim that most of the system does not depend on model quality.
- **The deterministic router survives the upgrade.** LLM-only routing improved from 67.5% to 82.5% but still loses to keyword rules at 92.5%, so `ROUTER_LLM_ENABLED` stays `false`. That decision is robust to model size rather than a workaround for a weak model.
- Reported benchmark numbers now describe `3b`; the `1b` numbers remain published as the comparison that justifies this decision, and both are reproducible by setting one environment variable.
- The headline result rests on a small sample: 15 cases, 14 anomalies, one run. "Zero false positives" is a property of this benchmark run, not a general guarantee, and is stated that way wherever it appears.
