# ADR-0027: Prometheus label cardinality discipline

**Status:** Accepted (V4)
**Date:** 2026-07-27
**Related:** [ADR-0022](0022-otel-dependency-set.md), [ADR-0023](0023-usage-events-and-cost-model.md), [ADR-0026](0026-observability-example-trace.md)

## Context

Prometheus is a *label-based* TSDB: every distinct
combination of label values is a separate time series.
A counter ``cortex_llm_calls_total`` with three labels
(``provider``, ``model``, ``event_type``) — each with a
small, finite set of values — produces tens of series.
The same counter with a ``tenant_id`` label, with one
series per tenant, produces *one series per customer*,
and the storage / scrape / query cost grows linearly
with the customer count.

The V4 brief is explicit: ``tenant_id``, ``user_id``,
``conversation_id`` are not Prometheus labels. The
question this ADR answers is **why**, and where the
high-cardinality data goes instead.

## Decision

### Allowed label set (V4)

A label is allowed on a V4 metric only if its cardinality
is *bounded by the system*, not by the user. The
enumerated allow-list is:

| Label          | Cardinality bound                                         |
| -------------- | --------------------------------------------------------- |
| ``method``     | the HTTP method set (≤10)                                |
| ``route``      | the FastAPI route *template* (e.g. ``/api/v1/documents/{id}``), not the raw URL |
| ``status_code``| the HTTP status code set (≤60)                            |
| ``provider``   | the provider set (``openai``, ``cohere``, ``voyage``, …) |
| ``model``      | the model set registered in ``src.billing.application.pricing`` |
| ``operation``  | the application operation name (e.g. ``embedding``, ``completion``, ``rerank``) |
| ``task_name``  | the Arq task name                                         |
| ``cache_type`` | ``embedding`` / ``search`` / ``query``                    |
| ``stage``      | the fixed 8 stages in ``PIPELINE_STAGE_DURATION_SECONDS`` |
| ``action``     | the closed ``AuditAction`` enum                           |
| ``outcome``    | ``ok`` / ``error``                                        |

These labels are checked into
``src/observability/infrastructure/metrics.py`` as a
module-level allow-list comment, and every metric
declaration in that file is reviewed against it at PR
time.

### Disallowed label set (V4)

A label is **never** added if its cardinality grows with
the user base. The banned set is:

* ``tenant_id``  — one series per tenant
* ``user_id``    — one series per user
* ``conversation_id`` — one series per conversation
* ``document_id`` — one series per document
* ``chunk_id``   — one series per chunk
* ``api_key_id`` — one series per API key
* ``request_id`` — unbounded (one per request)
* ``trace_id``   — unbounded (one per request)
* ``span_id``    — unbounded

### Where the high-cardinality data goes instead

The same data is **never lost** — it just lives in
systems designed for high cardinality:

| Data | Lives in | Query path |
| ---- | -------- | ---------- |
| Per-tenant request count       | ``usage_events`` table | ``GET /tenants/me/usage`` |
| Per-tenant cost                | ``usage_events`` table | ``GET /tenants/me/usage`` |
| Per-user actions               | ``audit_log`` table    | ``GET /audit-log`` (admin) |
| Per-conversation trace         | OTel trace tree        | Jaeger / Tempo UI |
| Per-request latency / errors   | OTel span attributes   | trace query ``duration > 1s AND tenant=...`` |
| Per-document access history    | ``audit_log`` table    | ``GET /audit-log?resource_type=document`` |

The principle: **metrics answer "how much, how often,
how slow"** for the *system as a whole*; **rows answer
"who did what, when, for how long"** for a *specific
tenant / user / conversation*. Putting the row-shaped
data into a TSDB would break it; putting the
aggregate-shaped data into a relational table would be
both expensive and pointless.

### How the discipline is enforced

Three mechanisms, in order of strictness:

1. **Documentation.** This ADR + the allow-list comment
   in ``metrics.py``. Any reviewer can read the rule.
2. **Code review.** Every PR that adds a new metric or
   label is checked against the allow-list. The CI
   pipeline runs the integration test in
   ``tests/integration/test_observable_rag_flow.py``,
   which asserts the metrics produced by a real request
   *do not* contain ``tenant_id``.
3. **Linter (planned V5).** A custom AST check that
   fails the build if a metric call site uses a
   keyword argument that matches the banned set
   (``labels(tenant_id=...)``). The check is small
   (~30 lines) and is tracked as a V5 hardening item.

## Consequences

### Positive

* Predictable Prometheus cost. The metric cardinality
  is bounded by *system constants* (model count,
  provider count, route count), not by the customer
  count. Adding 1,000 tenants does not change the
  Prometheus storage footprint.
* Cheap, fast queries. Grafana dashboards filter by
  label value (e.g. ``route="/api/v1/search"``); the
  query plan scans a finite, small index.
* The data is still findable. The trace UI knows the
  ``tenant_id`` because the trace itself carries it
  as a span attribute; the audit / usage REST APIs
  enforce tenant scoping at the application layer.

### Negative

* Aggregate dashboards cannot say
  "show me this tenant's request rate over time" as a
  *single* Grafana panel. The operator queries
  ``usage_events`` for that, or drills in from the
  trace UI. This is a deliberate trade — the V4
  answer is "open the tenant's usage page" rather
  than "scrape a per-tenant time series".
* The cardinality ceiling requires every new metric
  to be reviewed. This is a tax on new metric
  additions, but it is the right tax.

## Anti-patterns explicitly rejected

* **Pre-aggregating per-tenant counters in the
  application** and emitting them as
  ``cortex_tenant_requests_total{tenant_id=...}``.
  This collapses the cardinality by aggregating at
  the application but loses the ability to slice
  by route, model, or status code — and the
  aggregation cost is paid on every request.
* **Using Prometheus exemplars** to attach a
  ``trace_id`` to a sample. Exemplars are excellent
  for the "drill from metric to trace" use case,
  but they are not a substitute for keeping the
  high-cardinality dimension out of the label set
  in the first place. V4 attaches exemplars where
  the OTel SDK does it for free (none of the V4
  metrics have a ``trace_id`` label).
* **Storing tenant_id in a sidecar Redis counter.**
  This works but introduces a second source of
  truth, and the V4 ``usage_events`` table is the
  canonical record. A sidecar would only make
  sense if Grafana needed sub-second aggregation
  by tenant, which it doesn't (the V4 dashboards
  are minute-granularity or coarser).

## Reference

* [Prometheus best practices on labels and cardinality](https://prometheus.io/docs/practices/naming/#labels)
* [ADR-0022](0022-otel-dependency-set.md) — the OTel
  dependency set
* [ADR-0023](0023-usage-events-and-cost-model.md) —
  where the per-tenant cost lives
* [ADR-0026](0026-observability-example-trace.md) —
  the example trace tree (note: traces *do* carry
  ``tenant_id`` as a span attribute; metrics do not)
