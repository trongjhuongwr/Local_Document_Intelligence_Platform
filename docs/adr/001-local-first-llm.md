# ADR 001 — Local-first LLM on constrained hardware

## Status

Accepted (2026-08-18)

## Context

The platform must run end-to-end on a mid-range consumer laptop (Ryzen 5 6600H, 16 GB RAM, RTX 3050 4 GB) with no paid AI APIs. Windows 11 plus background services consume roughly half the RAM before the application starts, so every component competes for a ~7 GB budget shared with the IDE and browser.

## Decision

Use **Ollama on the Windows host** serving `llama3.2:1b` (generation) and `all-minilm` (embeddings), with a 4096-token default context. The LLM is treated as a bounded component behind an `LLMProvider` abstraction: it performs classification, extraction, and synthesis over evidence that deterministic software has already retrieved and validated. All financial calculations, ranking fusion, citation construction, and permission checks happen in Python, outside the model.

Development runs natively on Windows (venv via the `py` launcher); Docker Desktop is used only for PostgreSQL+pgvector, with the WSL2 backend capped at 3 GB so the database cannot starve the host.

## Alternatives considered

- **Cloud APIs (OpenAI/Anthropic):** better raw quality, but violates the no-paid-API constraint and removes the project's core engineering thesis.
- **Larger local model (7B+):** does not fit 4 GB VRAM without heavy quantization and CPU offload; latency becomes impractical for an interactive demo.
- **`llama3.2:3b` as default:** fits VRAM at Q4 and is a planned configurable upgrade, but 1B is the deliberate baseline to prove the system-design thesis; the provider abstraction makes swapping a config change.
- **WSL2 Ubuntu as primary dev environment:** cleaner Linux tooling, but a full second OS worth of RAM is not affordable on this machine.

## Consequences

- The system architecture must compensate for model weakness: constrained routing, schema-validated outputs with retry, deterministic rules, citation verification, human review.
- Everything works offline; the demo is fully reproducible on similar hardware.
- Honest evaluation matters more: extraction/routing accuracy of a 1B model is measured and reported, never assumed.
