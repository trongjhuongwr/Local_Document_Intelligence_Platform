# MCP Server (Milestone 8)

A thin, **strictly read-only** [Model Context Protocol](https://modelcontextprotocol.io) server
that exposes the platform to MCP clients (Claude Desktop, Claude Code, ...). It reuses the
existing services and repositories — retrieval, document metadata, stored extractions, the
deterministic discrepancy engine, and the review queue — and never writes anything.

## What it exposes

| Tool | Purpose |
| --- | --- |
| `search_documents` | BM25 / dense / hybrid chunk search with optional `case_id` / `document_type` filters |
| `get_document` | Metadata for one document by UUID |
| `get_document_fields` | Latest **schema-valid** stored extraction for a document (never runs the LLM) |
| `compare_documents` | Deterministic discrepancy analysis over a case's stored extractions |
| `get_review_findings` | Human-review tasks, filterable by status and case |

Permissions are enforced in code, not configuration:

- Only these five allowlisted tools exist — there is no arbitrary-SQL tool and no file access.
- Every tool is read-only (`readOnlyHint` annotation and read-only implementation): no
  `WorkflowRun`, `ReviewTask`, or `ExtractionRun` rows are ever created, and the LLM extractor
  is never invoked.
- Failures (Postgres down, Ollama unreachable, bad input) return structured
  `{"error": "..."}` payloads instead of tracebacks.

Requirements: Postgres must be running (see `.env`); Ollama is only needed for
`search_documents` with `mode="dense"` or `mode="hybrid"` — `bm25` works without it.

## Running

From the repository root (the working directory matters: `.env` is resolved relative to it):

```powershell
H:\myself\personal-project\Local_Document_Intelligence_Platform\.venv\Scripts\python.exe -m mcp_server
```

The server speaks MCP over **stdio**; structlog JSON logs go to **stderr** so stdout stays
reserved for the protocol.

## Client configuration

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "document-intelligence": {
      "command": "H:\\myself\\personal-project\\Local_Document_Intelligence_Platform\\.venv\\Scripts\\python.exe",
      "args": ["-m", "mcp_server"],
      "cwd": "H:\\myself\\personal-project\\Local_Document_Intelligence_Platform"
    }
  }
}
```

### Claude Code

Run from the repository root (so the server inherits it as cwd), or add the same JSON block
to `.mcp.json` in the repo root:

```powershell
claude mcp add document-intelligence -- H:\myself\personal-project\Local_Document_Intelligence_Platform\.venv\Scripts\python.exe -m mcp_server
```

## Example calls

### `search_documents`

```json
{"query": "total due", "mode": "bm25", "top_k": 3, "case_id": "case_042"}
```

```json
{
  "results": [
    {
      "filename": "invoice_9001.pdf",
      "document_type": "invoice",
      "page_number": 1,
      "section": null,
      "snippet": "Total Due: USD 82,500.00 payable Net 30",
      "score": 1.02,
      "chunk_id": "2f0c4b6e-...",
      "document_id": "b3a1d0f2-..."
    }
  ]
}
```

Invalid modes are rejected: `{"error": "invalid mode 'fuzzy': must be one of 'bm25', 'dense', or 'hybrid'"}`.

### `get_document`

```json
{"document_id": "b3a1d0f2-..."}
```

```json
{
  "id": "b3a1d0f2-...",
  "filename": "invoice_9001.pdf",
  "document_type": "invoice",
  "case_id": "case_042",
  "status": "parsed",
  "page_count": 1,
  "size_bytes": 1234,
  "sha256": "9c2f...",
  "created_at": "2026-08-18T09:15:00+00:00"
}
```

Unknown ids yield `{"error": "document <id> not found"}`; malformed ids yield
`{"error": "invalid document id '...': not a UUID"}`.

### `get_document_fields`

```json
{"document_id": "b3a1d0f2-..."}
```

```json
{
  "document_id": "b3a1d0f2-...",
  "document_type": "invoice",
  "data": {"invoice_number": "INV-MCP-1", "total": 82500.0, "currency": "USD", "...": "..."},
  "extracted_at": "2026-08-18T09:20:00+00:00",
  "prompt_version": "1"
}
```

Documents without a stored schema-valid extraction yield `{"error": "no extraction available"}`.

### `compare_documents`

```json
{"case_id": "case_042"}
```

```json
{
  "case_id": "case_042",
  "report": {
    "discrepancies": [
      {
        "type": "amount_exceeds_contract",
        "source": "DETERMINISTIC_MISMATCH",
        "severity": "high",
        "description": "Invoice INV-MCP-1 total 82,500.00 exceeds the contract maximum 75,000.00 by 7,500.00",
        "calculation": {
          "formula": "invoice_total - contract_maximum_amount",
          "operands": {"invoice_total": 82500.0, "contract_maximum_amount": 75000.0},
          "result": 7500.0
        }
      }
    ],
    "requires_human_review": true,
    "checks_run": 10,
    "documents_analyzed": 2
  },
  "missing_extractions": [
    {"document_id": "c7e2...", "filename": "payment_policy.pdf", "document_type": "policy"}
  ],
  "note": "read-only analysis over stored extractions; no workflow runs, review tasks, or LLM extraction runs were created"
}
```

### `get_review_findings`

```json
{"status": "open", "case_id": "case_042", "limit": 20}
```

```json
{
  "reviews": [
    {
      "review_id": "a45b...",
      "case_id": "case_042",
      "severity": "high",
      "status": "OPEN",
      "discrepancy": {"type": "amount_exceeds_contract", "description": "..."},
      "reviewer": null,
      "decided_at": null,
      "created_at": "2026-08-18T09:25:00+00:00"
    }
  ]
}
```

## Testing

```powershell
# Unit tests (stubbed services; no DB or Ollama needed)
.venv\Scripts\python.exe -m pytest tests\unit\test_mcp_tools.py

# Integration tests (live Postgres; seeds its own data, no Ollama needed)
.venv\Scripts\python.exe -m pytest tests\integration\test_mcp_integration.py -m integration
```
