# ADR-0023: Usage metering — events, cost model, billing context

**Status:** Accepted (V4)
**Date:** 2026-07-25

## Context

The PRD requires **per-tenant usage metering** for every
billable action in Cortex: embedding, completion, and rerank.
The "Usage & Billing" tab on the dashboard is the
read-side; the write-side is a row in the `usage_events`
table for every call.

The V3 design established `usage_events` as a
forward-declared table. V4 implements it. The decision to
record in this ADR is the **shape of the data** (entity +
model + indexes) and the **cost model** (how we go from
token counts to USD).

The constraints:

1. **Tenant scoping is mandatory.** Every row has a
   non-null `tenant_id`. The repository's `list_for_tenant`
   always takes a `tenant_id`; there is no `list_all()`.
2. **The cost is an estimate, not a billed amount.** We
   record what *we* compute locally from a public rate
   table; the authoritative invoice comes from the
   provider's billing portal in a later reconciliation
   pass.
3. **The call sites must not change shape.** V3's
   `EmbeddingProvider`, `LLMProvider`, and `RerankerPort`
   are network adapters — they don't know the tenant or
   the request. Pushing a `UsageService` into them would
   force every V3 caller to construct one.
4. **Billing must never break a request.** A failure to
   record a usage event is a warning, not a 5xx. The
   `UsageService.record` already swallows persistence
   errors; the V4 `BillableRecorder` adds the same
   guarantee at the call-site level.

## Decision

### Bounded context

The usage metering is owned by a new **billing** bounded
context, not by `observability`. Rationale: usage is a
business concept (cost attribution, tenant billing) and
the `observability` context is technical (tracing, logs,
metrics). The `BillableRecorder` in
`src/observability/application/billable.py` is the *only*
piece of cross-context coupling: it reads from
`src.billing.application.usage_service.UsageService` and
writes to the `usage_events` table.

### Event entity

```python
class UsageEvent:
    tenant_id: uuid.UUID                # required, NOT NULL
    event_type: EventType                # embedding | completion | rerank | storage | request
    units: float                         # token count or candidate count
    unit_type: UnitType                  # tokens | bytes | units | requests
    cost: float                          # USD, 6 decimal places
    id: uuid.UUID                        # PK
    provider: str | None                 # openai | anthropic | …
    model: str | None                    # text-embedding-3-small | gpt-4o-mini | …
    resource_id: str | None              # document_id | conversation_id | …
    created_at: datetime                 # UTC, tz-aware
```

Business rules enforced in `__post_init__`:

* `units >= 0`
* `cost >= 0`
* `event_type` and `unit_type` are coerced to the typed
  enum when constructed from a string, so callers can pass
  either.

### Database model

Single table: `usage_events`. The columns mirror the entity
exactly, with `cost` materialised as `cost_usd` (Float) for
SQL-side aggregation.

**Indexes:**

1. `(tenant_id, created_at)` — "what did tenant X use
   in period Y?". Drives the `/tenants/me/usage` endpoint.
2. `(tenant_id, event_type, created_at)` — "what did
   tenant X spend on embeddings in period Y?". Composite
   index for event-type-scoped queries.

**Constraints (CHECK):**

* `event_type IN ('embedding', 'completion', 'rerank', 'storage', 'request')`
* `unit_type IN ('tokens', 'bytes', 'units', 'requests')`
* `units >= 0`
* `cost_usd >= 0`

The CHECKs are defence in depth: the application must
already use the `EventType` / `UnitType` enums, but if a
developer ever writes a raw string, the DB rejects it.

### Cost model

A single `CostCalculator` class owns the rate table. The
default rates are the **publicly published** prices
(2026-07-25 snapshot) for the major OpenAI and Anthropic
models the V3 code uses:

* `text-embedding-3-small` — $0.00002 / 1K input tokens
* `text-embedding-3-large` — $0.00013 / 1K input tokens
* `gpt-4o-mini` — $0.00015 / 1K input, $0.00060 / 1K output
* `gpt-4o` — $0.00250 / 1K input, $0.01000 / 1K output
* `claude-3-5-sonnet` — $0.00300 / 1K input, $0.01500 / 1K output
* `claude-3-haiku` — $0.00025 / 1K input, $0.00125 / 1K output

**Env-var overrides.** Operators with a private enterprise
deal can override any rate without code changes:

```
CORTEX_LLM_COST_gpt-4o-mini_INPUT=0.00010
CORTEX_LLM_COST_gpt-4o-mini_OUTPUT=0.00040
```

The `CostCalculator` constructor reads these env vars
lazily, so a unit test can construct a calculator with an
explicit `rates={...}` dict and skip the env-var parsing
altogether.

**Unknown models get $0.00.** We never throw on a missing
rate; an unrecognised model is treated as a free model so
the application code (which doesn't know the rate) can
always complete the billing pipeline. The V4 logging
emits the model name, so a `0.0` cost is auditable — if
the operator adds a new model and forgets to set the rate,
the warning log fires once per call.

### Call-site wiring

The `BillableRecorder` is invoked from the V3 application
services that own the request context:

| Service | Method | What it records |
|---------|--------|-----------------|
| `EmbedDocumentChunksService.embed_document` | After each batched `embed_batch` call | `embedding` event with `input_tokens` (4-chars-per-token estimate), `vectors_produced` |
| `AnswerQueryService.stream_answer` | `finally` clause after the streaming `for token` loop | `completion` event with `input_tokens` (estimated from prompt-message characters), `output_tokens` (counted during streaming) |
| `RerankerService.rerank` | After a successful provider call | `rerank` event with `candidate_count` as `units` (the `IdentityReranker` is free; a real cross-encoder swap in V5 will bill by candidates) |

The `BillableRecorder` is **opt-in**: the V3 service
constructors accept a `billable: BillableRecorder | None`
parameter (default `None`). The unit test suite passes
`None`; production code (the `get_answer_query_service_async`
dependency) constructs a real `BillableRecorder(usage_service=…)`.

### Repository

`UsageEventSqlRepository` is sync (it owns its own
`Session`). The methods:

* `add(event)` — flush, returns the event with
  `created_at` populated.
* `add_bulk(events)` — used by the V5 batched-worker
  flush path.
* `list_for_tenant(tenant_id, since, until, event_type, limit)`
  — newest first; default limit 200.
* `aggregate_for_tenant(tenant_id, since, until)` — SQL-side
  `GROUP BY (event_type, unit_type)` returning
  `{event_type: {unit_type: sum_units, cost_usd: sum}}`
  plus a `total_cost_usd` key. No client-side arithmetic.

### Read API

* `GET /api/v1/tenants/me/usage` — aggregate for the
  current tenant over an optional period. Defaults to the
  current calendar month.
* `GET /api/v1/tenants/me/usage/events` — raw events,
  newest first; admin drill-down.

Both routes require authentication (`get_current_user`)
and resolve the tenant from the JWT. The repository's
`tenant_id` filter is what enforces tenant isolation; the
route never trusts a `tenant_id` query parameter.

## Consequences

- V3's `OpenAIEmbeddingProvider` / `OpenAIProvider` /
  `IdentityReranker` are **unchanged**. All V3 unit tests
  (418 as of V3-alpha) still pass; the new behaviour is
  purely additive.
- Adding a new model is a one-line change to
  `DEFAULT_RATES` (or a one-line env var). The application
  code doesn't need to know.
- The `usage_events` table is append-only; the
  application never updates or deletes rows. Future
  reconciliation (the operator's actual invoice) joins
  against the provider's billing portal export.
- A "missing rate" cost is `$0.00` and is **not silent**:
  the `usage_event_recorded` log line carries the model
  name, so a search for `cost_usd:0 model:text-embedding-4-new`
  surfaces the gap immediately.

## References

- ADR-0014: Embedding provider (the model is the cost
  lookup key)
- ADR-0019: LLM provider abstraction (the V3 streaming
  shape that the V4 token-counting logic builds on)
- `Docs/database.md` — the canonical table contract
