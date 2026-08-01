# Index & Query Performance Review

V9 Part 1, Task 8.

This document audits every Postgres, Redis, pgvector, and
forward-compat Neo4j index in the Cortex platform and records the
expected query plan, the rationale, and the estimated improvement.

The audit is a *living* document; every PR that adds a new
index must update the corresponding row in the matrix below.

---

## 1. Postgres index matrix

| Table | Index | Column(s) | Type | Used by | Notes |
| --- | --- | --- | --- | --- | --- |
| `tenants` | PK | `id` | btree | everywhere | default |
| `tenants` | `ix_tenants_slug` | `slug` | btree UNIQUE | tenant lookup by slug | login flow |
| `users` | PK | `id` | btree | everywhere | default |
| `users` | `ix_users_tenant_email` | `(tenant_id, email)` | btree UNIQUE | login, user list | the most-hit table; the composite covers all tenant-scoped lookups |
| `users` | `ix_users_api_key` | `api_key_hash` | btree | API key auth | sparse (only API key users) |
| `documents` | PK | `id` | btree | everywhere | default |
| `documents` | `ix_documents_tenant_owner` | `(tenant_id, owner_id)` | btree | dashboard list | |
| `documents` | `ix_documents_tenant_status` | `(tenant_id, status)` | btree | filter UI | |
| `documents` | `ix_documents_tenant_updated` | `(tenant_id, updated_at DESC)` | btree | recent activity | |
| `chunks` | PK | `id` | btree | everywhere | default |
| `chunks` | `ix_chunks_document` | `(document_id)` | btree | document detail | |
| `chunks` | `ix_chunks_tenant_document` | `(tenant_id, document_id)` | btree | tenant-scoped chunk list | |
| `chunk_embeddings` | PK | `id` | btree | everywhere | default |
| `chunk_embeddings` | `ix_chunk_embeddings_chunk` | `(chunk_id)` | btree UNIQUE | join | |
| `chunk_embeddings` | `ix_chunk_embeddings_tenant_chunk` | `(tenant_id, chunk_id)` | btree | tenant-scoped join | |
| `agent_agents` | PK | `id` | btree | everywhere | default |
| `agent_agents` | `ix_agent_agents_tenant` | `(tenant_id)` | btree | list | |
| `agent_runs` | PK | `id` | btree | everywhere | default |
| `agent_runs` | `ix_agent_runs_tenant_agent` | `(tenant_id, agent_id, created_at DESC)` | btree | dashboard | covers the dashboard query path |
| `agent_runs` | `ix_agent_runs_tenant_status` | `(tenant_id, status)` | btree | filter | |
| `mcp_sessions` | PK | `id` | btree | everywhere | default |
| `mcp_sessions` | `ix_mcp_sessions_tenant` | `(tenant_id)` | btree | list | |
| `mcp_sessions` | `ix_mcp_sessions_token` | `(token_hash)` | btree UNIQUE | auth | |
| `kg_entities` | PK | `id` | btree | everywhere | default |
| `kg_entities` | `ix_kg_entities_tenant_name` | `(tenant_id, name)` | btree | search | |
| `kg_entities` | `ix_kg_entities_tenant_type` | `(tenant_id, entity_type)` | btree | filter | |
| `kg_relations` | PK | `id` | btree | everywhere | default |
| `kg_relations` | `ix_kg_relations_source` | `(tenant_id, source_entity_id)` | btree | traversal | the workhorse of the 1-hop neighbourhood |
| `kg_relations` | `ix_kg_relations_target` | `(tenant_id, target_entity_id)` | btree | reverse traversal | |
| `kg_extraction_jobs` | PK | `id` | btree | everywhere | default |
| `kg_extraction_jobs` | `ix_kg_extraction_jobs_tenant_status` | `(tenant_id, status)` | btree | worker | |
| `usage_events` | PK | `id` | btree | everywhere | default |
| `usage_events` | `ix_usage_events_tenant_day` | `(tenant_id, day, event_type)` | btree | rollup | supports the V9 ``TenantUsageRollup`` refresh |
| `audit_events` | PK | `id` | btree | everywhere | default |
| `audit_events` | `ix_audit_events_tenant_action_time` | `(tenant_id, action, created_at DESC)` | btree | audit log query | |

### 1.1 pgvector (HNSW) indexes

| Table | Index | Column | Type | Used by | Notes |
| --- | --- | --- | --- | --- | --- |
| `chunk_embeddings` | `ix_chunk_embeddings_hnsw` | `embedding vector_cosine_ops` | HNSW (m=16, ef_construction=64) | vector search | per ADR-0003 |
| `kg_entities` | `ix_kg_entities_embedding_hnsw` | `embedding vector_cosine_ops` | HNSW | KG semantic search | forward-compat (V7) |

### 1.2 Full-text search (tsvector) indexes

| Table | Index | Column | Type | Used by | Notes |
| --- | --- | --- | --- | --- | --- |
| `chunks` | `ix_chunks_fts` | `to_tsvector('english', content)` | GIN | BM25 search | per ADR-0008 |

---

## 2. Slow-query catalog

For every slow query the platform supports, this section
captures the EXPLAIN ANALYZE shape, the identified bottleneck,
and the index (or rewrite) that fixed it. New slow queries
are added as they appear in the benchmark reports.

### 2.1 Document list

```sql
SELECT id, title, status, updated_at
FROM documents
WHERE tenant_id = $1
  AND ($2::text IS NULL OR status = $2)
ORDER BY updated_at DESC
LIMIT 20;
```

* **Plan:** Index Scan on `ix_documents_tenant_updated`.
* **Estimated improvement over the V6 baseline:** 8× faster
  (Seq Scan → Index Scan Backward).

### 2.2 Vector search (1-NN over 100k chunks)

```sql
SELECT chunk_id, embedding <=> $1 AS distance
FROM chunk_embeddings
WHERE tenant_id = $2
ORDER BY embedding <=> $1
LIMIT 50;
```

* **Plan:** HNSW index scan, ef_search=40.
* **Tuning knob:** `HNSW_EF_SEARCH` (configurable per query).
* **Note:** Tenant filter applied *after* the ANN; for very
  large tenants, partition by `tenant_id` is a future option.

### 2.3 Graph 1-hop neighbourhood

```sql
SELECT r.target_entity_id, r.relationship_type, r.confidence
FROM kg_relations r
WHERE r.tenant_id = $1 AND r.source_entity_id = $2
ORDER BY r.confidence DESC
LIMIT 50;
```

* **Plan:** Index Scan on `ix_kg_relations_source`.
* **Note:** Forward-compat: when the Neo4j backend is enabled
  (ADR-0004), this becomes a Cypher MATCH and the index is
  the Neo4j range index on `(tenant_id, source_entity_id)`.

---

## 3. Redis cache keys

| Key pattern | TTL | Purpose | Notes |
| --- | --- | --- | --- |
| `cortex:search:{tenant_id}:{query_hash}` | 5 min | per-tenant search result cache | invalidated by ``tenant_search_version`` |
| `cortex:kg:neighbors:{tenant_id}:{entity_id}` | 10 min | graph neighbourhood cache | invalidated on entity / relation write |
| `cortex:read_model:{name}:{tenant_id}:{entity_id}` | 1 min | projection snapshot cache | invalidated on rebuild |
| `cortex:lock:{name}:{tenant_id}:{entity_id}` | 30 s | distributed lock lease | released by holder or expires |
| `cortex:ratelimit:{tenant_id}:{window}` | 60 s | per-tenant rate limit | sliding-window counter |

---

## 4. Neo4j (forward-compat)

The V7 knowledge graph runs on Postgres. The forward-compat
Neo4j indexes (per ADR-0004) are listed here for completeness;
they are *not* materialised today.

| Index | Label / relationship | Property | Type |
| --- | --- | --- | --- |
| `tenant_idx` | `Entity` | `tenant_id` | range |
| `tenant_name_idx` | `Entity` | `(tenant_id, name)` | composite |
| `tenant_type_idx` | `Entity` | `(tenant_id, type)` | composite |
| `tenant_source_idx` | `Relationship` | `(tenant_id, source_id)` | composite |
| `tenant_target_idx` | `Relationship` | `(tenant_id, target_id)` | composite |

---

## 5. Verification

The benchmark suite under ``benchmarks/`` records the
EXPLAIN ANALYZE plan for each of the queries above and
fails the build when the actual plan regresses by more
than 10% (configurable via ``BENCHMARK_REGRESSION_THRESHOLD``).
