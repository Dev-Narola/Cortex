# Worker Autoscaling Strategy

V9 Part 2, Task 19.

Cortex runs five distinct worker pools, each with a
different scaling rule. The numbers below are the
recommendation for a 1,000-tenant deployment; smaller
deployments can run a single process that hosts all
queues.

## Embedding worker

* **Scales by:** queue depth on `embedding`.
* **Min:** 1 process × 4 jobs.
* **Max:** 16 processes × 8 jobs.
* **Target:** queue depth ≤ 100.
* **Cooldown:** 60 s.
* **Knobs:** `EMBEDDING_BATCH_SIZE`, `EMBEDDING_TIMEOUT`.

## Graph extraction worker

* **Scales by:** queue depth on `graph_extraction`.
* **Min:** 1 process × 2 jobs.
* **Max:** 8 processes × 4 jobs.
* **Target:** queue depth ≤ 50.
* **Cooldown:** 90 s (LLM calls are slow; avoid thrash).
* **Knobs:** `QUEUE_BATCH_SIZE`, `LLM_TIMEOUT`.

## Agent execution worker

* **Scales by:** concurrent agent runs.
* **Min:** 2 processes × 2 jobs.
* **Max:** 16 processes × 4 jobs.
* **Target:** concurrent runs ≤ 8 per process.
* **Cooldown:** 30 s.
* **Knobs:** `MAX_WORKER_CONCURRENCY`.

## MCP long-running worker

* **Scales by:** active sessions + queue depth on
  `mcp_long_running`.
* **Min:** 1 process × 4 jobs.
* **Max:** 8 processes × 8 jobs.
* **Target:** active sessions ≤ 250 per process.
* **Cooldown:** 60 s.

## Ingestion worker

* **Scales by:** queue depth on `ingestion`.
* **Min:** 1 process × 4 jobs.
* **Max:** 4 processes × 8 jobs.
* **Target:** queue depth ≤ 50.
* **Cooldown:** 30 s.

## Observability

* `cortex_worker_active{queue, instance}` — gauge.
* `cortex_worker_jobs_total{queue, status}` — counter.
* `cortex_queue_depth{queue}` — gauge.
* `cortex_queue_oldest_age_seconds{queue}` — gauge
  (alert when > 300 s).

## SLO

* 95% of embedding jobs complete within 30 s.
* 95% of graph extraction jobs complete within 5 min.
* 95% of agent executions start within 10 s of submission.
