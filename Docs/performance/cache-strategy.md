# Cache Strategy

V9 Part 2, Task 16.

Cortex uses a three-level cache. The goal of this document is
to make the policy explicit: which level, which key, which TTL,
and how invalidation propagates.

## Levels

### L1 — Application memory

* **Storage:** in-process dict inside the application
  instance; LRU; bounded by `CACHE_L1_MAX_ENTRIES` (default
  1024).
* **Use cases:** hot config (tenant settings, tool
  registry, prompt templates), small per-request
  denormalisations.
* **TTL:** 30 seconds by default; per-entry override allowed.
* **Coherence:** every entry is tagged with the API process
  id; readers always check before use.
* **Limitation:** the cache is local to the API instance; do
  not use it for cross-instance state.

### L2 — Redis

* **Storage:** Redis (the existing instance, db index 0).
* **Use cases:** search result cache, graph neighbourhood
  cache, projection snapshots, rate-limit counters,
  distributed locks.
* **TTL:** 5 minutes by default
  (`settings.CACHE_DEFAULT_TTL`).
* **Coherence:** every key includes a tenant prefix; a
  per-tenant `tenant_search_version` counter is bumped on
  every write so the application can `DEL` the entire
  tenant namespace in O(1).
* **Eviction:** `allkeys-lru` (configured in the redis
  service).

### L3 — Persistent storage

* **Storage:** Postgres (or Neo4j for the KG).
* **Coherence:** source of truth; caches are always
  read-through with TTL.

## Cache candidates

| Candidate | Level | Key | TTL | Invalidation |
| --- | --- | --- | --- | --- |
| Tenant settings | L1 | `tenant:{id}:settings` | 60 s | on tenant update |
| Tool registry | L1 | `tools:registry` | 30 s | on tool register / update |
| Prompt templates | L1 | `prompt:{name}` | 5 min | on template update |
| Search results | L2 | `cortex:search:{tenant_id}:{query_hash}` | 5 min | tenant write → bump `tenant_search_version` |
| Graph neighbours | L2 | `cortex:kg:neighbors:{tenant_id}:{entity_id}` | 10 min | entity / relation write |
| Read model snapshots | L2 | `cortex:read_model:{name}:{tenant_id}:{entity_id}` | 1 min | on rebuild |
| Rate-limit counters | L2 | `cortex:ratelimit:{tenant_id}:{window}` | 60 s | TTL only |
| Distributed locks | L2 | `cortex:lock:{name}:{tenant_id}:{entity_id}` | 30 s | release / expire |

## Tenant safety

* **Never serve a cache entry from a different tenant.**
  Every key is prefixed with the tenant id; the cache wrapper
  raises ``TenantMismatchError`` when a key lookup yields a
  different tenant (defence in depth — the prefix should
  already prevent the collision).
* The cache invalidation service refuses to delete a
  cross-tenant pattern.
* Background reapers verify the tenant id on every
  retrieved entry.

## Warmup

* When ``CACHE_WARMUP_ENABLED`` is true, the API process
  loads the most-recently-touched 100 tenants' settings on
  startup.
* The MCP server pre-loads the tool registry and resource
  providers on boot.

## Observability

* ``cache_hits_total`` / ``cache_misses_total`` are
  recorded per cache level.
* ``cache_invalidation_total`` is recorded by
  ``CacheInvalidationService`` with a `reason` label
  (write, manual, ttl, drift).
* ``cache_stale_served_total`` records every time the
  application served a stale snapshot because the
  rebuild failed.
