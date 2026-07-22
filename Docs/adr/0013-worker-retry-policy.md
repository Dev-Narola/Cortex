# 13. Worker Retry Policy

Date: 2026-07-22

## Status

Accepted

## Context

Background ingestion tasks can fail for many reasons. Some failures are transient (a brief network timeout reaching S3, a momentary database connection drop) and will succeed if retried. Others are permanent (a corrupt file that can never be parsed, an unsupported MIME type) and will never succeed no matter how many times they are retried.

A blanket retry policy wastes resources and delays the user's ability to understand that their document is unprocessable. No retry policy at all forces manual intervention for every transient failure. We need a nuanced policy that:

1. Retries transient failures automatically with backoff.
2. Immediately marks permanent failures as `failed` without retry.
3. Caps total attempts to prevent runaway retry loops.
4. Notifies operators when a document exceeds its retry budget.

## Decision

### Retryable vs. non-retryable errors

| Error class | Type | Retry? |
|---|---|---|
| `StorageDownloadError` | Transient | ✅ Yes |
| `DatabaseConnectionError` | Transient | ✅ Yes |
| `asyncio.TimeoutError` | Transient | ✅ Yes |
| `ParserError` | Permanent | ❌ No |
| `UnsupportedMimeTypeError` | Permanent | ❌ No |
| `DocumentNotFoundError` | Permanent | ❌ No |
| `InvalidStatusTransitionError` | Permanent | ❌ No |
| Unexpected `Exception` | Treated as permanent | ❌ No |

Retryable errors are identified by the `RetryableWorkerError` marker exception. Non-retryable errors are identified by `PermanentWorkerError`. Any unexpected exception is treated as permanent to prevent blind retries on unknown errors.

### Retry parameters

| Parameter | Value | Rationale |
|---|---|---|
| Max attempts | 3 | Enough to survive transient blips; not so many that a slow failure wastes significant resources. |
| Backoff | Exponential, base 2s | 2s → 4s → 8s. Prevents thundering herd on shared infrastructure. |
| Jitter | ±20% of backoff interval | Prevents all retrying workers from hitting the same resource simultaneously. |
| Timeout per attempt | 300 seconds | Generous enough for large documents; prevents zombie workers. |

### Failure handling

When a document exhausts all retry attempts or encounters a permanent error:

1. `document.transition_to(DocumentStatus.FAILED)` is called.
2. `document.last_error` is set to the exception message.
3. A `DocumentProcessingAttemptModel` row is written with `status="failed"` and the error message.
4. The cache entry for the document's status is invalidated.

The document remains in `failed` state until a user explicitly triggers `POST /documents/{id}/retry`, which resets it to `pending` and re-enqueues the job. This restart-from-beginning approach is simpler and safer than stage-level resumption (see ADR-0011).

### Arq integration

Arq's `WorkerSettings` exposes `retry_jobs`, `max_tries`, and `keep_result` fields. Our settings are configured in `src/ingestion/workers/worker.py`. Arq handles the scheduling of retries and backoff; our task function is responsible for raising `RetryableWorkerError` vs. `PermanentWorkerError` to signal Arq's retry behaviour.

## Consequences

- Every new error type introduced in the worker layer must be explicitly classified as retryable or permanent. Unclassified errors default to permanent.
- The `max_tries=3` limit means a document will make at most 3 processing attempts before landing in `failed`. This is enforced by Arq at the queue level; our task also checks the `job_try` context field for logging purposes.
- The `last_error` field on `DocumentModel` holds only the most recent failure message. Full history is available in `DocumentProcessingAttemptModel`.
- If S3 is down for an extended period, documents will exhaust their retries and land in `failed`. An operator must trigger bulk retry via `scripts/reprocess_tenant.py` once S3 recovers.
