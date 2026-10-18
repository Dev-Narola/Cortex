"""Billing bounded context.

Owns:

* ``UsageEvent`` — every billable action (embedding, completion,
  rerank, storage, request) is recorded here with a cost estimate
  and tenant scope.
* Per-tenant usage queries (current period, by event type).
* Cost estimation policy (per-model / per-event-type rates).
* Rate-limit state lives here too (``RateLimiter`` reads/writes
  Redis token-bucket counters).

Per the PRD, every embedding / completion / rerank call must
record a usage event queryable per tenant. That's the contract
this context delivers.
"""
