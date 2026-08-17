# ADR 005 — Human approval before consequential actions

## Status

Accepted (2026-08-18)

## Context

The system detects potential financial problems (overbilling, duplicate invoices, policy violations). Acting on a false positive — or silently swallowing a true positive — has real cost. No local model, and frankly no model, should close that loop alone.

## Decision

Detected issues become review tasks (`OPEN → APPROVED | REJECTED → RESOLVED`) persisted with reviewer identity and timestamp. High-severity findings always require review before a report is considered final. The UI's Review Queue exposes each finding with its severity, deterministic calculation, and evidence citations so a human can decide in seconds. The system never claims to make legal, accounting, or payment decisions.

## Alternatives considered

- **Fully automatic reporting:** cheaper per case, but one wrong automatic accusation of overbilling destroys trust in every other finding.
- **Confidence-threshold auto-approval:** premature without months of calibration data; revisit once real precision numbers exist.

## Consequences

- Review actions are auditable rows, which also become an evaluation signal (review-task creation accuracy in `evals/workflow`).
- The demo honestly shows a human clicking Approve — which is what a credible enterprise workflow looks like.
