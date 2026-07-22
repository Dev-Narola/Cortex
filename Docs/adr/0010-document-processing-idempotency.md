# 10. Document Processing Idempotency

Date: 2026-07-22

## Status

Accepted

## Context

Background workers are unreliable by nature. A job may be retried due to:

- A transient infrastructure failure (network timeout, database blip).
- A worker crash mid-execution.
- An explicit manual retry triggered via `POST /documents/{id}/retry`.
- A forced reprocess triggered via `POST /documents/{id}/reprocess`.

Without an idempotency strategy, retrying a document that was partially processed could leave the database in an inconsistent state — for example, containing duplicate chunks, orphaned processing records, or a status that no longer reflects reality.

The system must guarantee: **processing a document N times produces exactly the same end state as processing it once.**

## Decision

Idempotency is enforced through two mechanisms.

### 1. Chunk replacement, not accumulation

When a worker begins the chunking phase, it calls `ChunkRepository.replace_all(document_id, tenant_id, chunks)`. This operation:

1. Deletes all existing `DocumentChunkModel` rows for the given `(document_id, tenant_id)` pair within the same database transaction.
2. Inserts the newly generated chunks.
3. Commits atomically.

This means no matter how many times the pipeline runs, the database will always contain exactly the chunks produced by the most recent successful run. Stale chunks from a previous attempt cannot persist.

### 2. Processing attempt log

Each invocation of `ingest_document_task` creates a `DocumentProcessingAttemptModel` row recording:

- `attempt_number` — monotonically increasing per document.
- `started_at`, `finished_at` — timestamps.
- `status` — `"succeeded"` or `"failed"`.
- `error_message` — populated on failure.

This provides an audit trail and enables retry-count-based policies without relying on mutable fields in the `DocumentModel`.

### What "idempotent" means here

| Scenario | Outcome |
|---|---|
| First run succeeds | Document is `indexed` with N chunks. |
| Second run (same content) | Old chunks deleted, same N chunks re-inserted. Document remains `indexed`. |
| Second run (different content) | Old chunks deleted, new M chunks inserted. Document reflects new content. |
| First run fails, retry succeeds | Partial state from first run is replaced by complete state of retry. |
| Two concurrent runs for same document | Last writer wins at the DB level due to the transactional `replace_all`. No duplicates. |

## Consequences

- `ChunkRepository.replace_all` must run inside a single database transaction. Splitting the delete and insert across transactions would create a window where the document has zero chunks — visible to read queries.
- The approach does not use a distributed lock. Concurrent retries are tolerated; the last write wins cleanly.
- `DocumentProcessingAttemptModel` rows accumulate over time. A future maintenance job or retention policy should prune records older than a defined horizon (e.g., 90 days), keeping only the latest N attempts per document.
- Clients observing the status endpoint may briefly see `pending` or `parsing` between retries. This is expected and documented in ADR-0011.
