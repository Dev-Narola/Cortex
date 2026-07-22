# 9. Redis as Task Broker and Cache

Date: 2026-07-22

## Status

Accepted

## Context

The V2 ingestion pipeline needs two distinct runtime capabilities:

1. **Task queuing** — the API must enqueue background processing jobs and workers must dequeue and execute them reliably.
2. **Cache invalidation** — after a document is indexed, the system must invalidate any cached document-list or status responses so clients see up-to-date data immediately.

These two concerns are related: both require a fast, in-memory data store that all application processes can reach. We evaluated running separate infrastructure for each concern (e.g., RabbitMQ for queues + Memcached for cache) versus a single Redis instance covering both.

### Dedicated broker (RabbitMQ + Memcached)

- RabbitMQ is a purpose-built message broker with sophisticated routing, exchanges, and durable queues.
- Memcached is a purpose-built cache with a simpler operational model than Redis.
- Requires operating, monitoring, and connecting two separate services.
- Adds significant infrastructure complexity for V2 scale requirements.

### Redis (single service)

- Redis natively supports both use cases: it provides list/stream-based queues (used by Arq) and key-value cache with TTL.
- Already chosen by Arq as its broker protocol — no additional dependency.
- Single connection string to configure; single service to deploy and monitor.
- Supports pub/sub for future real-time status notifications.
- Production-grade high-availability via Redis Sentinel or Redis Cluster.

## Decision

We use a **single Redis instance** as both the **Arq task broker** and the **application-level cache**.

- **Broker use:** Arq workers poll a dedicated Redis list (`arq:queue:default` by default). The API enqueues jobs via `ArqRedis.enqueue_job`.
- **Cache use:** `src/platform/cache.py` provides a thin `invalidate_cache` / `get_cached` / `set_cache` abstraction over `aioredis`. Document list and status endpoints may be cached here. Cache keys are namespaced by `tenant_id` to prevent cross-tenant cache pollution.

## Consequences

- A Redis instance is a hard infrastructure dependency. The application will not start without it (the worker cannot connect).
- In test environments, Redis is mocked via `unittest.mock.patch` on `invalidate_cache` and `enqueue_job` to prevent tests from requiring a running server.
- Cache TTL values must be kept short (≤ 30 seconds for status endpoints) to avoid stale reads during active processing.
- Keys must always be prefixed with `tenant_id` to uphold the tenant isolation contract established in ADR-0006.
- If Redis becomes unavailable at runtime, the application must degrade gracefully: the API can continue to serve reads from the database, but new ingestion jobs cannot be enqueued until Redis recovers.
