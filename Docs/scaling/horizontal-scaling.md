# Horizontal Scaling

V9 Part 2, Task 14.

Cortex is designed to be deployed behind a load balancer with
multiple stateless API instances. This document records the
per-component scaling strategy and the recommended
instance counts at each growth stage.

## Design principles

* **No in-process state that matters.** All mutable
  per-request state lives in Redis, Postgres, or the
  vector store. The API process can be killed at any
  point without losing user data.
* **Workers are interchangeable.** Arq workers pull from
  a shared Redis queue; adding a worker increases
  throughput linearly up to the LLM provider's rate
  limits.
* **Stateless MCP server.** Every MCP session is
  persisted in Redis (key `cortex:mcp:session:{id}`) so a
  websocket can reconnect to a different instance.
* **Database is the only shared mutable surface.** All
  writes go through the database's MVCC; reads use the
  read replica when one is configured.

## Per-component scaling strategy

### API

| Metric | Bottleneck | Strategy | Recommended count (1k tenants) |
| --- | --- | --- | --- |
| Request throughput | CPU | Add API instances behind the LB | 6 |
| Memory | Per-request allocations | Add API instances; tune L1 cache size | 6 |
| DB connections | Pool size | Tune `POSTGRES_POOL_SIZE` × instances ≤ 200 | 10 / instance |

### Workers

| Queue | Bottleneck | Strategy | Recommended count |
| --- | --- | --- | --- |
| `ingestion` | CPU + I/O | Arq workers; concurrency = CPU × 2 | 4 workers × 8 jobs |
| `embedding` | LLM rate limit | Arq workers; concurrency = provider limit | 4 workers × 4 jobs |
| `graph_extraction` | LLM rate limit | Arq workers; concurrency = provider limit | 4 workers × 4 jobs |
| `agent_execution` | CPU + LLM | Arq workers; one execution per job | 8 workers × 2 jobs |
| `mcp_long_running` | WebSocket count | Arq workers; one per session | 4 workers × 4 jobs |

### Databases

* **Postgres primary** — single instance up to ~2k
  tenants; promote to a multi-AZ deployment with read
  replicas past that point.
* **Postgres read replica** — read-heavy services
  (search, list, dashboard) can be configured to use the
  replica.
* **Redis** — single primary + replicas; the distributed
  lock service uses the primary.
* **Neo4j** — cluster of 3 core nodes (forward-compat).

## Maximum expected throughput

At the recommended instance counts above, Cortex supports:

* **API:** ~3,000 RPS sustained, 6,000 RPS burst.
* **Ingestion:** 200 docs/min sustained, 500 docs/min burst.
* **Embedding:** 5,000 chunks/min sustained.
* **Graph extraction:** 1,500 chunks/min sustained.
* **Agent execution:** 60 concurrent agents.
* **MCP:** 2,000 concurrent sessions.

## Adding capacity

1. Add a new API instance behind the LB.
2. Add a new Arq worker process (one container per worker).
3. Verify the new process passes readiness (see
   `docs/scaling/capacity-planning.md`).
4. Update the load balancer target group.

No state migration is required; the new process joins the
fleet immediately.
