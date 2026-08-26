# 🏛️ Document Intelligence & Cross-Verification Copilot

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL + pgvector](https://img.shields.io/badge/PostgreSQL-16_+_pgvector-4169E1.svg?style=flat-square&logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![Ollama](https://img.shields.io/badge/Ollama-llama3.2:1b-000000.svg?style=flat-square&logo=ollama)](https://ollama.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-workflow-1C3C3C.svg?style=flat-square)](https://langchain-ai.github.io/langgraph/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg?style=flat-square&logo=react)](https://reactjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)

> A **local-first** document intelligence platform that cross-examines packs of business documents (service agreements, purchase orders, invoices, AP policies), detects inconsistencies with deterministic rules, and answers questions with page-level evidence citations — running entirely on a consumer laptop with a 1-billion-parameter model and **no paid AI APIs**.

---

## 📌 Problem statement & core thesis

The expensive failures in accounts payable do not live inside a single document — they live **between** documents. An invoice that exceeds the contract cap. A currency that silently changed. Payment terms that drifted from what was signed. A duplicate invoice number carrying a different total.

Checking this by hand is slow. Handing it to an unconstrained chatbot is unauditable.

This project takes the third path, and it is the entire point of the repository:

> **Reliability comes from system design, not model size.**

`llama3.2:1b` is a weak model, chosen deliberately. Everything software can decide, software decides:

| Concern | Who decides | Why |
|---|---|---|
| Financial comparisons & differences | **Python** (`Decimal`, storing formula + operands as provenance) | An LLM must never do arithmetic a controller will act on |
| Which documents are inconsistent | **12 deterministic rules** over normalised values | Reproducible, explainable, testable — scores F1 = 1.00 against ground truth |
| Query routing | **Deterministic keyword rules** | Measured: 92.5% vs 67.5% for the 1B model on the same labelled set |
| Ranking & fusion | **Reciprocal Rank Fusion in Python** | Deterministic, no model in the loop |
| Citations | **Built by software before generation**, verified after | The model may only reference IDs it was handed; invented IDs are stripped |
| Approval of findings | **A human**, through a persisted review queue | The system never claims accounting authority |

The LLM is left with the bounded jobs it can actually do: schema-validated field extraction and evidence-grounded answer synthesis.

---

## 🛠️ System architecture

```mermaid
flowchart TD
    UI["React + Vite SPA"] -->|/api| API["FastAPI backend"]
    MCP["MCP server (read-only tools)"] --> SVC

    API --> SVC["Service layer"]
    SVC --> ING["Ingestion: parse → structure-aware chunk → SHA-256 dedupe"]
    ING --> PG[("PostgreSQL 16 + pgvector")]

    SVC --> ROUTE["Deterministic query router"]
    ROUTE --> BM25["BM25 (in-process)"]
    ROUTE --> VEC["pgvector dense search"]
    BM25 --> RRF["Reciprocal Rank Fusion"]
    VEC --> RRF
    RRF --> CTX["Context builder (budget + dedupe)"]
    CTX --> LLM["llama3.2:1b via Ollama"]
    LLM --> VERIFY["Citation verification"]

    SVC --> WF["LangGraph compare workflow"]
    WF --> EX["Structured extraction (schema-validated + repair pass)"]
    EX --> RULES["12-rule discrepancy engine"]
    RULES --> REPORT["Exception report + calculation provenance"]
    REPORT --> REVIEW["Human review queue"]
    REVIEW --> AUDIT["Audit trail"]

    EVAL["evals/ — 7 reproducible suites"] -.measures.-> RULES
    EVAL -.measures.-> EX
    EVAL -.measures.-> RRF
    EVAL -.measures.-> LLM
```

**Embeddings** use a dedicated 45 MB encoder (`all-minilm`) rather than the generation model — a generation model makes a poor embedder, and separating the two frees the LLM for generation.

---

## 📸 Product tour

<p align="center">
  <img src="docs/images/01_home_dashboard.png" alt="Home workspace" width="100%" />
  <br/><em>Workspace home: case readiness, open findings and system status, all read from the running backend.</em>
</p>

### 1. Grounded Q&A with an evidence inspector

<p align="center">
  <img src="docs/images/04_grounded_qa_inspector.png" alt="Grounded Q&A with citation inspector" width="100%" />
  <br/><em>Every factual claim carries a citation marker. Clicking it opens the exact chunk — verbatim text, document, page, section.</em>
</p>

The model receives only retrieved evidence blocks and may cite only the identifiers it was given. Citations are constructed deterministically *before* generation and verified *after*: any marker that does not resolve to a stored chunk is detected and stripped rather than displayed.

<p align="center">
  <img src="docs/images/03_ask_copilot_initial.png" alt="Ask view with suggested questions" width="100%" />
</p>

### 2. Case & document-pack management

<p align="center">
  <img src="docs/images/02_cases_manager.png" alt="Case manager" width="100%" />
  <br/><em>A case groups a document pack. Readiness is computed from what has actually been ingested and indexed.</em>
</p>

### 3. Human-in-the-loop review queue

<p align="center">
  <img src="docs/images/05_review_findings.png" alt="Review queue" width="100%" />
  <br/><em>Each finding shows severity, the deterministic calculation behind it, and its evidence. States: OPEN → APPROVED/REJECTED → RESOLVED, with reviewer and timestamp persisted.</em>
</p>

### 4. Benchmark & evaluation dashboard

<p align="center">
  <img src="docs/images/06_benchmark_evaluation.png" alt="Evaluation dashboard" width="100%" />
  <br/><em>The dashboard renders the JSON reports generated by the evaluation suite. It never displays a number the suite did not produce — sections without a report say so.</em>
</p>

---

## 📊 Benchmark results

Every number below was produced by `python -m evals.run_all --cases 15` on the hardware described further down, against the **DocFlowBench** synthetic corpus, and written to [`evals/reports/`](evals/reports/). Run date: **2026-08-26**. Nothing here is hand-written — regenerate it and the claims either reproduce or they do not.

| Evaluation | Result | Detail |
|---|---|---|
| **Discrepancy rules** (perfect extraction) | **P/R/F1 = 1.00** | 14/14 ground-truth anomalies, 0 false positives |
| **Structured extraction** (`llama3.2:1b`) | **95.7%** field accuracy · **100%** schema validity | contract 99.1% · PO 97.3% · invoice 92.2% · policy 100% · median 1.6 s/doc |
| **Retrieval** — BM25 | **Recall@5 0.93** · MRR 0.70 · **17.5 ms** | recommended default |
| **Retrieval** — dense (pgvector) | Recall@5 0.65 · MRR 0.41 · 518 ms | |
| **Retrieval** — hybrid RRF | Recall@5 0.88 · MRR 0.58 · 520 ms | |
| **Query routing** | **92.5%** deterministic | LLM-assisted 82.5% · LLM-only 67.5% |
| **Discrepancy detection, end-to-end** | P 52.2% · R 85.7% · **F1 0.65** | 12 TP / 11 FP / 2 FN across 15 cases |
| **Grounded Q&A citations** | present **90%** · valid **90%** · correct document **82%** | 60 queries · median 799 ms · p95 934 ms |
| **Workflow success** | **15/15 completed** · review-task consistency **100%** | median 10.8 s per case · 0 extraction failures |

### The two results worth discussing in an interview

**1. Deterministic routing beats the LLM — so the LLM was switched off.**
The 1B model scores 67.5% on the labelled routing set (20% zero-shot, before few-shot prompting). Keyword rules score 92.5%. Even keyword-first-then-LLM lands at 82.5% — the model *degrades* an already-good decision. `ROUTER_LLM_ENABLED=false` is therefore the default, and the routing report keeps all four variants side by side as the evidence.

**2. The gap between rules (F1 1.00) and end-to-end (F1 0.65) is the measured price of a 1B extractor.**
The rules are perfect when handed perfect fields. End to end, precision falls to 52% while recall holds at 86%. With roughly 30 extracted fields per case, a single wrong field invents a finding or hides one. Because the engine is deterministic, **every end-to-end error is attributable to extraction** — a bounded, measurable component rather than a diffuse "the AI got it wrong". Swapping in a 3B model is a configuration change, and the same suite will quantify the delta.

---

## 🧪 DocFlowBench: the synthetic benchmark

Public invoice datasets rarely ship as *related packs with labelled cross-document inconsistencies*, so the repository generates its own, deterministically:

```bash
python -m synthetic_data.generator --seed 42 --cases 30
```

Same seed → byte-identical PDFs and ground truth. Each case is a contract + purchase order + invoice(s) + AP policy rendered as real PDFs, with ground-truth JSON covering **12 anomaly types** (amount exceeds contract, PO mismatch, wrong currency, vendor mismatch, duplicate invoice, date outside contract term, inconsistent payment terms, missing required field, incorrect tax, incorrect total, conflicting invoice number, policy violation) plus deliberately clean cases, in obvious and subtle variants.

---

## ✨ Capabilities

* **Ingestion** — PDF / DOCX / TXT / MD / CSV, structure-aware chunking that never splits a table, SHA-256 content dedupe, MIME sniffing by magic bytes (never by extension).
* **Structured extraction** — Pydantic schemas enforced through Ollama constrained decoding at temperature 0, with a corrective retry and a **single-field repair pass** for anything left null.
* **Hybrid retrieval** — BM25 + pgvector dense + RRF, with metadata filters (case, document type, filename).
* **12-rule discrepancy engine** — normalised comparison of vendor, currency, terms, dates, totals, tax and caps; every numeric finding carries `formula`, `operands` and `result`.
* **LangGraph workflow** — an explicit state machine (load → extract → rules → review tasks → report), persisted with its step trace; extraction failures force human review rather than passing silently.
* **Human review queue** — single and batch decisions, reviewer identity and timestamps persisted.
* **Audit trail** — a chronological event view projected from rows the system already persists (cases, documents, workflow runs, review decisions, queries, auditor attestations), with a SHA-256 integrity digest chained over the projected sequence and re-verified on read.
* **Read-only MCP server** — exposes search, document fields, comparison and review findings to MCP-compatible clients without granting write access.

---

## 🛡️ Reliability & guardrails

* Structured outputs are Pydantic-validated with a corrective retry; persistent failures are recorded as failed extraction runs — **never silently filled with invented values** (nullable fields are mandatory wherever evidence may be absent).
* Retrieved document text is treated as untrusted data; system prompts pin the model to evidence-only behaviour against prompt injection.
* Tools are allowlisted with typed input/output contracts; the model has **no SQL, file or shell access**.
* Upload size limits, path-traversal-safe storage (server-generated UUID filenames), MIME validation.
* Separate `product` / `test` / `eval` databases with a hard guard (`assert_safe_database_url`) that refuses to point a test or evaluation run at production data.
* Structured JSON logging on every LLM call (tokens, durations, retries, schema validity), retrieval (mode, candidates, latency) and workflow (steps, status, review flags).

---

## 💻 Designed for consumer hardware

```text
AMD Ryzen 5 6600H · 16 GB RAM · RTX 3050 4 GB · Windows 11
```

The constraint is the feature: a 1B generation model plus a 45 MB embedder, pgvector instead of a vector-database service, in-process BM25 instead of Elasticsearch, one container of infrastructure, ~4096-token contexts, batched embeddings. Everything still runs CPU-only if the GPU is unavailable.

---

## 🚀 Quick start

**Prerequisites:** Python 3.12+, Node.js 18+, Docker Desktop, [Ollama](https://ollama.com).

```bash
# 1. Models (one-time, ~1.4 GB total)
ollama pull llama3.2:1b
ollama pull all-minilm

# 2. One-shot setup: Postgres + databases + venv + migrations + benchmark corpus
scripts/bootstrap.sh          # Windows: scripts\bootstrap.ps1

# 3. Frontend dependencies
npm install
```

`bootstrap` starts the `pgvector/pgvector:pg16` container, creates the `docintel_product` / `docintel_test` / `docintel_eval` databases, builds `.venv`, applies Alembic migrations and generates the DocFlowBench corpus. Copy `.env.example` to `.env` first if you need non-default ports.

**Run it:**

```bash
# Terminal 1 — API on http://127.0.0.1:8001
.venv/bin/uvicorn app.api.main:app --port 8001 --reload

# Terminal 2 — UI on http://localhost:5173 (proxies /api to the backend)
npm run dev
```

`GET /ready` verifies PostgreSQL, Ollama and both models, returning actionable hints (e.g. `ollama pull all-minilm`) when something is missing. Interactive OpenAPI docs live at `/docs`.

---

## ✅ Tests & evaluations

```bash
pytest -m "not ollama and not integration"   # fast suite — no services required
pytest -m integration                        # + live PostgreSQL
pytest -m ollama                             # + live Ollama
npm run lint                                 # tsc --noEmit

python -m evals.run_all --cases 15           # full suite (requires EVAL_DATABASE_URL)
python -m evals.run_all --skip-llm           # deterministic evaluations only (CI-safe)
```

Reports are written to `evals/reports/*_latest.{json,md}` plus a consolidated `latest.md`, and the Evaluation view renders exactly those files.

---

## 📡 API reference

All application routes are served under `/api`; `/health` and `/ready` are additionally exposed bare for container probes.

```text
GET    /api/ready                        POST   /api/query
GET    /api/cases                        POST   /api/search
POST   /api/cases                        POST   /api/compare
GET    /api/cases/{id}                   GET    /api/workflows/{id}
DELETE /api/cases/{id}                   GET    /api/reviews
POST   /api/cases/{id}/documents         POST   /api/reviews/{id}/approve|reject|resolve
POST   /api/cases/{id}/analyses          POST   /api/reviews/batch
POST   /api/demo/cases                   GET    /api/audit-trail
GET    /api/documents                    GET    /api/audit-trail/export
GET    /api/documents/{id}               GET    /api/evals
GET    /api/documents/{id}/chunks        POST   /api/evals/run
DELETE /api/documents/{id}               GET    /api/evals/runs/{id}
POST   /api/documents/{id}/index
```

`POST /api/cases/{id}/analyses` returns `202` with a workflow id — poll `GET /api/workflows/{id}` for step-by-step progress. `POST /api/evals/run` launches the real evaluation subprocess and returns a run id; it never returns metrics.

---

## 📂 Repository structure

```text
app/              FastAPI backend
  api/            routes, dependencies, middleware
  agents/         deterministic router, LangGraph graph, typed tools
  discrepancy/    normalisation + the 12-rule engine
  extraction/     Pydantic schemas, extraction service with repair pass
  retrieval/      bm25, vector, fusion, hybrid, context budgeting, indexer
  citations/      deterministic citation construction + verification
  llm/            provider abstraction, Ollama client, versioned prompts
  embeddings/     provider abstraction, Ollama embeddings
  services/       documents, cases, compare, reviews, qa, audit, evals runner
  models/         SQLAlchemy models
src/              React + Vite frontend
evals/            7 evaluation suites + generated reports
synthetic_data/   DocFlowBench generator (seeded PDFs + ground truth)
mcp_server/       read-only MCP tools over the existing services
migrations/       Alembic migrations
tests/            unit · integration · ollama-marked live tests
docs/adr/         architecture decision records
scripts/          bootstrap + database provisioning
```

---

## ⚠️ Known limitations

Stated plainly, because a portfolio that hides its edges is not worth reading:

* **The 1B extractor is the accuracy bottleneck** — 95.7% field accuracy yields end-to-end discrepancy precision of 52%. Measured, attributed, and improvable by swapping the model.
* **The audit trail is a projection, not an append-only ledger.** Events are derived from live tables at read time and the SHA-256 digest is computed over that projection. It makes changes *visible on re-read*; it does **not** prove the source rows were never modified, and it is not a compliance control.
* **No authentication or multi-tenancy.** Reviewer identity is a free-text field. This is a single-user portfolio system, not a hosted product.
* **BM25 rebuilds its corpus per search** — fine at benchmark scale (~10³ chunks), documented as a scaling limit.
* **No OCR** — native-text PDFs, DOCX, TXT, MD and CSV only. Scanned documents are out of scope.
* **Citations are chunk/page-level**, not character-offset level.
* **Dense retrieval underperforms BM25 on this corpus** (0.65 vs 0.93 Recall@5), because business documents are dense with exact identifiers. The honest conclusion was to default to BM25 rather than ship hybrid because it sounds more sophisticated.

---

## 🔭 Future improvements

* Swap in `llama3.2:3b` (fits 4 GB VRAM at Q4) behind the existing provider abstraction and publish the before/after eval delta.
* Optional cloud-provider fallback through the same `LLMProvider` protocol.
* A genuine append-only audit ledger written at event time, so "tamper-evident" becomes a defensible claim.
* Tesseract OCR path for scanned documents.
* CPU cross-encoder reranking behind `ENABLE_RERANKER` (scaffolded, disabled).
* Incremental BM25 indexing and pgvector HNSW tuning for larger corpora.
* A `GET /api/documents/{id}/extraction` endpoint so the split viewer can do field-by-field reconciliation directly.

---

## 📄 License

MIT © Arthur Nguyen
