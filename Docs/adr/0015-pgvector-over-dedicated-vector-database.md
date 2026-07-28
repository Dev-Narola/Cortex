# ADR-0015: pgvector over a dedicated vector database

**Status:** Accepted (V3)
**Date:** 2026-07-24

## Context

V3 needs a place to store dense embeddings and run ANN queries.
The candidates are:

1. **pgvector** (PostgreSQL extension) — what we have.
2. A dedicated vector database: Pinecone, Weaviate, Qdrant, Milvus.

The blueprint explicitly says: *"start with pgvector and only
consider a dedicated vector database later if there is a real
operational reason."*

## Decision

Use **pgvector** with HNSW indexing for the V3 release.

### Why

1. **One database, one transaction.** Chunks, embeddings, and
   their relational metadata (tenant, document) live in the
   same Postgres row. A delete on the parent document cascades
   to chunks and kg_entities in a single ACID transaction.
   With a separate vector DB, deletion is a two-phase commit
   that *will* leave orphans on partial failure.
2. **Tenant isolation already lives in Postgres.** pgvector's
   `WHERE tenant_id = :tenant_id` is the same WHERE clause we'd
   write for any other table. No second authorisation layer to
   get wrong.
3. **No new operational surface.** pgvector is `CREATE EXTENSION`
   on a Postgres 16 image; no new service to deploy, monitor,
   back up, or version.
4. **HNSW at our scale is fine.** pgvector's HNSW benchmarks
   to < 50ms p95 on 1M vectors on a modest Postgres instance.
   The project is at 0–100K vectors for the foreseeable future.

### When we'd revisit

A dedicated vector DB becomes the right move when any of the
following become real (not hypothetical):

* ANN p95 latency exceeds 100ms at expected production volume.
* Multi-tenant isolation at the *vector* level becomes a
  regulatory requirement (separate clusters per tenant).
* The product needs metadata filtering on the *vector* side
  that's awkward to express as a Postgres WHERE clause.
* Embedding re-indexing time on a single Postgres instance
  becomes a product bottleneck.

Until one of those is true, the operational simplicity of
pgvector wins.

## Consequences

- **Indexing:** HNSW with ``m=16``, ``ef_construction=64``,
  ``ef_search=40`` (configurable in ``src/core/config.py``).
- **Distance metric:** cosine, with distance-to-similarity
  conversion centralised in the repository (1 − distance).
- **Migration story:** to swap to a dedicated vector DB later,
  the swap is contained to the repositories
  (``VectorSearchRepository``). The application code depends on
  the port, not the implementation.
