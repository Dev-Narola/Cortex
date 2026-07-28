# ADR-0024: Performance baseline — p95 latency and first-token targets

**Status:** Accepted (V4)
**Date:** 2026-07-26

## Context

The PRD requires "a defined p95 query latency target
and first streamed token target." V4 is the first
version of Cortex with this bar.

The brief is explicit: "Define latency targets based
on your actual local environment. ... The exact
target should be documented based on your hardware
and provider latency. Do not claim sub-100ms without
measurement."

V4 has no production traffic yet. The targets below
are **V4-baseline numbers** — i.e. what a single
developer-class laptop running local Postgres +
local Redis + the OpenAI ``gpt-4o-mini`` API
achieves. They will be re-measured after the V5 load
test, and the ADR is the canonical place to record
the new number.

## Decision

### Targets

| Metric                          | V4-baseline target | V5 stretch  |
|---------------------------------|--------------------|-------------|
| `cortex_pipeline_stage_duration_seconds{stage="query_embedding"}` p95 | ≤ 250 ms | ≤ 150 ms |
| `cortex_pipeline_stage_duration_seconds{stage="vector_search"}` p95     | ≤ 100 ms | ≤ 50 ms  |
| `cortex_pipeline_stage_duration_seconds{stage="keyword_search"}` p95    | ≤ 80 ms  | ≤ 50 ms  |
| `cortex_pipeline_stage_duration_seconds{stage="fusion"}` p95             | ≤ 20 ms  | ≤ 10 ms  |
| `cortex_pipeline_stage_duration_seconds{stage="rerank"}` p95            | ≤ 200 ms | ≤ 100 ms (real cross-encoder) |
| `cortex_pipeline_stage_duration_seconds{stage="context_construction"}` p95 | ≤ 20 ms | ≤ 10 ms |
| `cortex_pipeline_stage_duration_seconds{stage="llm_first_token"}` p95   | ≤ 1500 ms | ≤ 1000 ms |
| `cortex_pipeline_stage_duration_seconds{stage="llm_total"}` p95         | ≤ 4000 ms (depends on max_tokens) | depends on max_tokens |

The two **headline** numbers the brief calls out are:

* **Search + rerank p95 < 1000 ms** — sum of the
  embedding / vector / keyword / fusion / rerank
  stage targets above, with comfortable headroom.
* **First streamed token p95 < 1500 ms** — the
  ``llm_first_token`` target.

These are **not** SLOs. They're an internal baseline
the operator uses to *detect* regressions, not a
contract the customer sees.

### What is *not* a target

* **Auth (request middleware).** Auth happens
  *before* the request enters the pipeline; the
  middlewares record it under
  ``cortex_http_request_duration_seconds`` with a
  ``route`` label. A slow auth is an infra
  problem, not an answer-quality problem.
* **DB connection acquisition.** Instrumented by
  the SQLAlchemy OTel instrumentor; not a pipeline
  target.
* **Token cost.** Cost is a billing target, not a
  latency target.

### How the targets are measured

Every V4 answer request records a
:class:`PipelineTimings` (see
``src/observability/infrastructure/timings.py``).
The helper writes to the Prometheus histogram
:data:`PIPELINE_STAGE_DURATION_SECONDS`. The
operator reads the histogram with
``histogram_quantile(0.95, ...)` to compute p95
per stage.

The per-stage breakdown is the headline of the
diagnostic. A "search + rerank p95 = 1500 ms"
alert should immediately trigger a Prometheus
drilldown:

* Is ``rerank`` the slow stage? → cross-encoder
  network round-trip; cache the top-K with a
  short TTL.
* Is ``vector_search`` the slow stage? → index
  health; HNSW ``ef_search`` may be too high.
* Is ``llm_first_token`` the slow stage? → network
  to OpenAI; switch to a streaming provider closer
  to the customer.

### What changes in V5

The V5 follow-up replaces the V4-baseline column
with a *measured* p95 number from a 1k-request
load test. The ADR is the single source of truth
for the "is the system fast enough?" answer. A new
ADR supersedes this one; the metric names +
histogram buckets stay stable so the Grafana
dashboards don't break.

## Consequences

* The ``PipelineTimings`` helper is on the hot path
  of every answer request. Its overhead is one
  ``time.perf_counter_ns()`` per stage boundary and
  one ``Histogram.labels(...).observe()`` per stage
  exit. The latter is ~1 µs and is the only network
  call (the Prometheus exposition runs in a separate
  process). The total overhead is well under 1 ms per
  request, dwarfed by the LLM round-trip.
* The histogram is the source of truth; the in-
  memory report (for log lines) is a *secondary*
  signal. If the two disagree, the histogram wins.
* A V5 change to the histogram buckets (e.g. adding
  a 30s bucket) is a non-breaking change to the
  dashboards.

## References

* ADR-0022: OpenTelemetry dependency set (the
  tracing stack that produces the trace tree the
  histogram sits inside).
* ADR-0023: Usage events and cost model (cost is a
  sibling concern, tracked by the ``cortex_llm_*``
  metrics, not the stage histogram).
