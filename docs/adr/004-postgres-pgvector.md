# ADR 004 — PostgreSQL + pgvector as the only database

## Status

Accepted (2026-08-18)

## Context

The platform needs relational data (documents, chunks, extractions, workflow runs, review tasks), dense vectors, and metadata filtering — on a machine already sharing 16 GB with the OS, an IDE, and Ollama.

## Decision

One PostgreSQL 16 instance (Docker) with the pgvector extension holds everything. Vector search happens where the metadata lives, so filtered retrieval ("only invoices in case_007") is a WHERE clause plus vector ordering in a single query. SQLAlchemy 2 async + Alembic manage access and migrations.

## Alternatives considered

- **Dedicated vector DB (Qdrant/Weaviate/Milvus):** another always-on service and a second source of truth to synchronise — unjustifiable at this scale.
- **FAISS in-process:** fast, but no persistence/filtering story without building one, and state diverges from the relational data.
- **SQLite + sqlite-vec:** lightest option, but loses concurrent API access patterns and the production-standard Postgres story this portfolio intends to demonstrate.

## Consequences

- One backup/migration/connection story; `docker compose up -d postgres` is the entire infrastructure.
- Vector indexing beyond benchmark scale (HNSW tuning) is documented as future work, not needed at ~10³ chunks.
