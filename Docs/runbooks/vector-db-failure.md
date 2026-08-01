# Runbook — Vector Database Failure

V9 Part 3, Task 37.

Cortex stores vectors in pgvector (the same Postgres
primary). The runbook covers the rare case where the
HNSW index is corrupted or the database is unreachable.

## Detection

* `cortex_vector_search_latency_seconds` > 5 s
* `/health/ready` reports `degraded` for the vector
  index
* Embedding queries time out

## Immediate response

1. Check the database status (see `database-failure.md`).
2. If the database is healthy, check the HNSW index:
   `SELECT * FROM pg_indexes WHERE indexname = 'ix_chunk_embeddings_hnsw';`.
3. If the index is missing, rebuild it:
   `REINDEX INDEX CONCURRENTLY ix_chunk_embeddings_hnsw;`.
4. If the index is fine, check the embedding worker for
   backlog.

## Escalation

* If the index cannot be rebuilt, escalate to the
  database team.
* If the embedding worker is the bottleneck, scale up
  per `docs/scaling/workers.md`.

## Recovery

1. The application switches to a keyword-only search
   while the index is rebuilt.
2. The keyword search is slower but correct.
3. Once the index is back, vector search resumes.

## Validation

* Vector search latency returns to baseline.
* The smoke test suite passes.

## Post-incident review

* Record the timeline in `reports/security/postmortems/`.
* Identify the root cause.
* File a follow-up action item.
