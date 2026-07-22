# 8. Arq for Background Workers

Date: 2026-07-22

## Status

Accepted

## Context

The V2 ingestion pipeline requires asynchronous document processing. After a client uploads a document via `POST /documents`, the server must:

1. Accept the file and store its metadata immediately.
2. Return `202 Accepted` to the client without waiting for parsing or chunking to complete.
3. Execute the actual parsing, chunking, and indexing pipeline in the background.

This requires a background task queue. The two primary candidates evaluated were **Celery** and **Arq**.

### Celery

- Industry-standard, battle-tested, and widely documented.
- Uses a synchronous execution model; async support requires the `gevent` or `eventlet` pool, which adds complexity and compatibility concerns.
- Requires `billiard` for multi-processing, which conflicts with certain async patterns.
- Task serialisation defaults to pickle, which is a security concern.
- Heavy dependency footprint.

### Arq

- Designed specifically for async Python. Tasks are plain `async def` coroutines.
- Built on `asyncio` and `aioredis` — directly compatible with FastAPI's event loop.
- Workers share the same async connection pool as the application with no bridging layers.
- Minimal API surface: task functions are regular coroutines registered via `WorkerSettings`.
- Native support for retries, deferred execution, timeout per job, and health checks.

## Decision

We use **Arq** as the background task queue and worker framework.

Task functions live in `src/ingestion/workers/tasks.py` and are registered in `src/ingestion/workers/worker.py` via `WorkerSettings.functions`. The API routes enqueue tasks via an `ArqRedis` pool injected at request time.

## Consequences

- Workers run in the same async ecosystem as the application — no event-loop bridging, no thread pool hacks.
- Task functions can `await` any async dependency (database, storage, cache) natively.
- Celery is not used anywhere in this project. Mixing both would create two competing worker systems — this is explicitly forbidden.
- If Celery compatibility is required in future (e.g., to integrate with a Celery-based platform), this ADR must be revisited and the worker layer fully migrated in a single change.
- Arq requires Redis as its broker and result backend (see ADR-0009).
