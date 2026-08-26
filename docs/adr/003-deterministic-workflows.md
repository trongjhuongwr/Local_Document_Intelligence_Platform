# ADR 003 — Deterministic software around a bounded LLM

## Status

Accepted (2026-08-18)

## Context

`llama3.2:1b` cannot be trusted with open-ended autonomous reasoning: it miscalculates arithmetic, drifts from instructions, and hallucinates under ambiguity. The platform's core value — financial discrepancy detection — must be auditable.

## Decision

Software controls the workflow; the model performs only bounded tasks (classification, extraction, synthesis over given evidence), always through Pydantic-validated structured outputs with one corrective retry. Everything decidable by software is decided by software:

- financial comparisons and differences: plain Python over `Decimal`-derived values, with per-finding `Calculation` provenance (formula + operands);
- rank fusion, citation construction, permission checks: deterministic code;
- discrepancy findings are labeled `DETERMINISTIC_MISMATCH` vs `MODEL_SUSPECTED_MISMATCH` so consumers can tell rule output from model opinion;
- the model never executes SQL, touches files, or receives arbitrary tool access.

## Alternatives considered

- **Autonomous agent with open tool loop:** impressive demos, unauditable failures; with a 1B model, mostly failures.
- **Bigger model instead of guardrails:** violates hardware constraints and only hides the architectural problem.

## Consequences

- The discrepancy engine reproduces benchmark ground truth with F1 = 1.0 under perfect extraction (verified in tests), so end-to-end errors are attributable to extraction — measurable and improvable in isolation.
- More code than a prompt-only solution, but every finding is explainable to an auditor.
