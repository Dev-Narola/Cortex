# 11. Document Status State Machine

Date: 2026-07-22

## Status

Accepted

## Context

Document ingestion is a multi-stage asynchronous pipeline. A client uploads a file and then must poll `GET /documents/{id}/status` to learn when processing is complete. Without a defined state machine, the status field becomes an informal string — difficult to validate, easy to corrupt, and impossible to reason about programmatically.

We need a formal set of states, valid transitions between them, and explicit rejection of invalid transitions.

## Decision

The document lifecycle is modelled as a finite state machine with the following states and transitions.

### States

| State | Meaning |
|---|---|
| `pending` | Document metadata saved, file uploaded to S3. Waiting in the worker queue. |
| `parsing` | Worker has dequeued the job and is extracting text from the raw file. |
| `chunking` | Raw text extracted. Worker is splitting it into indexed chunks. |
| `indexed` | All chunks persisted. Document is ready for search and retrieval. |
| `failed` | A non-retryable error occurred. Manual intervention or retry required. |

### Valid transitions

```
pending   → parsing    (worker picks up the job)
parsing   → chunking   (text extraction succeeded)
chunking  → indexed    (all chunks persisted)

pending   → failed     (pre-flight validation failure, e.g. unsupported MIME type)
parsing   → failed     (non-retryable parse error, e.g. corrupt file)
chunking  → failed     (non-retryable chunking error)

failed    → pending    (explicit retry or reprocess operation)
indexed   → pending    (explicit reprocess operation — bumps document version)
```

### Invalid transitions (rejected by `DocumentStatusTransitionService`)

The following transitions must raise `InvalidStatusTransitionError`:

- `indexed → parsing` (without a prior reprocess operation)
- `indexed → chunking` (without a prior reprocess operation)
- `parsing → pending`
- `chunking → pending`
- `chunking → parsing`
- Any transition to the same state (no-op transitions are not permitted)

### Implementation

Status updates are validated through `Document.transition_to(new_status)` on the domain entity before any database write. The entity raises `InvalidStatusTransitionError` if the transition is not in the allowed set. This ensures the state machine is enforced at the domain layer, not scattered across infrastructure code.

## Consequences

- All worker code must go through `document.transition_to(...)` rather than setting `document.status` directly. Direct mutation bypasses the machine and is not permitted.
- The `retry` endpoint resets status to `pending` via `transition_to(PENDING)` from `failed` — this is an allowed transition.
- The `reprocess` endpoint resets status to `pending` from `indexed` — this is also an allowed transition.
- Adding a new pipeline stage (e.g., `embedding`) in V3 requires adding a new state and its transitions to the entity, updating this ADR, and adding tests for the new edges.
- The `failed → pending` transition is intentionally broad: a retry always restarts the full pipeline from the beginning. Resuming from a specific stage (e.g., re-running only chunking after a chunker fix) is not supported in V2 to keep the state machine simple and safe.
