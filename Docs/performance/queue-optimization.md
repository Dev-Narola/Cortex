# Queue & Worker Optimisation

V9 Part 2, Task 18.

This document captures the operational levers Cortex exposes
for the Arq-based worker fleet. The defaults are tuned for a
small production host; large-scale deployments should override
the values that matter and re-measure.

## Queues

| Queue | Concurrency | Visibility timeout | Max tries | Notes |
| --- | --- | --- | --- | --- |
| `ingestion` | `ARQ_MAX_JOBS` (10) | 300 s | 4 | document chunking |
| `embedding` | `ARQ_MAX_JOBS` (10) | 300 s | 4 | embedding generation |
| `graph_extraction` | `MAX_WORKER_CONCURRENCY` (16) | 600 s | 3 | LLM-bound; LLM calls dominate |
| `agent_execution` | `MAX_WORKER_CONCURRENCY` (16) | 600 s | 3 | long-running |
| `mcp_long_running` | 8 | 300 s | 3 | stream-friendly jobs |

## Batch sizes

* **Embedding batch:** `EMBEDDING_BATCH_SIZE` (default 100).
  Tuned against OpenAI's `text-embedding-3-small` which
  accepts up to 2048 inputs per call but accuracy drops
  for very large batches.
* **Graph extraction batch:** `QUEUE_BATCH_SIZE` (default
  32). One LLM call extracts entities + relations for up to
  32 chunks at a time.
* **Agent execution batch:** not batched (each invocation is
  a unit).

## Retry policy

* Transient failures (network, rate limit, 5xx) retry
  with exponential backoff: 1 s → 2 s → 4 s → 8 s, with
  ±20% jitter.
* Permanent failures (4xx other than 429, validation
  errors) move straight to the dead-letter queue.
* `RETRY_MAX_ATTEMPTS` (3) caps the total tries.

## Dead-letter handling

* DLQ key: `cortex:dlq:{queue_name}:{job_id}`.
* The DLQ is durable (Redis with AOF enabled).
* The worker records `dlq_total` per queue; the ops
  dashboard exposes the last 100 DLQ entries with
  clickable traces.

## Worker concurrency

* `MAX_WORKER_CONCURRENCY` (16) caps the per-process
  concurrency.
* `WORKER_PROCESSES` is derived from
  `min(CPU_COUNT, MAX_WORKER_CONCURRENCY)`. Operators can
  scale by adding processes, not by increasing the
  per-process concurrency beyond the cap.

## Queue depth

* `cortex_queue_depth` (per-queue gauge) is scraped every
  15 s.
* The autoscaler (V9 Part 2 Task 19) reacts to
  `queue_depth > threshold` and adds processes.

## Observability

* `cortex_worker_active` — per-process gauge
* `cortex_worker_jobs_total{queue, status}` — counter
* `cortex_worker_job_duration_seconds{queue}` — histogram
* `cortex_queue_depth{queue}` — gauge
* `cortex_dlq_total{queue}` — counter
