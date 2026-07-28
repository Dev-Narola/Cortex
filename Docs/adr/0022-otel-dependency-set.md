# ADR-0022: OpenTelemetry dependency set for V4

**Status:** Accepted (V4)
**Date:** 2026-07-25

## Context

V4 introduces a full observability stack: distributed tracing,
structured logging, Prometheus metrics, health checks, and
usage metering. The architecture calls for **OpenTelemetry** as
the tracing framework and the de-facto standard for
application telemetry in 2026 — every other observability tool
in the Cortex roadmap (Jaeger, Tempo, the OTel Collector, the
existing Prometheus scrape) reads OTel-shaped data.

The dependency set has to satisfy four hard requirements:

1. **Distributed tracing** that propagates context from the
   HTTP request through the application service, into SQL,
   Redis, and the LLM provider.
2. **GenAI semantic conventions** (``gen_ai.*`` attributes)
   for embedding, completion, and rerank spans — the OTel
   GenAI SIG is the canonical source.
3. **Auto-instrumentation** for the three external
   dependencies the V3 hot path actually touches:
   SQLAlchemy (Postgres), Redis (cache), and HTTPX
   (outbound HTTP).
4. **No PII in telemetry.** No document content, no LLM
   prompts, no API keys, no JWTs ever reach a span attribute
   or a log line. The default configuration must enforce
   this.

## Decision

Add the following OpenTelemetry packages to ``pyproject.toml``:

| Package | Purpose | Why essential |
|---------|---------|---------------|
| `opentelemetry-api` | Application-facing API (``tracer.start_as_current_span``) | Required by every span call site. Stays importable in the test suite even when the SDK isn't configured. |
| `opentelemetry-sdk` | `TracerProvider` / `MeterProvider` / span processors | The runtime that turns API calls into exportable spans. |
| `opentelemetry-exporter-otlp-proto-http` | OTLP/HTTP span exporter | The export protocol. HTTP works through corporate proxies; gRPC does not. See ADR-0019's sibling for the same choice. |
| `opentelemetry-instrumentation-fastapi` | Server spans for every FastAPI request | Replaces a hand-rolled `TracingMiddleware` and gives us canonical `http.*` attributes out of the box. |
| `opentelemetry-instrumentation-sqlalchemy` | Spans for every `Session.execute()` | Required to answer "which SQL was slow on this request?" — Phase 4. |
| `opentelemetry-instrumentation-redis` | Spans for every `redis.get` / `redis.set` | Required to answer "was the cache hit or miss?" — Phase 4. |
| `opentelemetry-instrumentation-httpx` | Spans for outbound HTTPX calls | A few external lookups (webhooks, future integrations). The OpenAI SDK uses `httpx` underneath, so the LLM call gets a child client span for free. |
| `opentelemetry-instrumentation-arq` | Spans for Arq background jobs | Phase 2 requirement: "upload → ingest_document_task → … → embed → index" must be one trace tree. |
| `opentelemetry-semantic-conventions` | The `gen_ai.*` attribute keys | Required by the GenAI spans (Phase 5). Without it the attribute names drift between releases. |

Plus the two adjacent packages Phase 6 and Phase 8 need:

| Package | Purpose | Why essential |
|---------|---------|---------------|
| `structlog` | Structured JSON logging | Phase 6 — replaces the V3 stdlib `basicConfig` with a structured processor pipeline. |
| `prometheus-client` | Prometheus exposition | Phase 8 — renders the `/metrics` endpoint. The Prometheus client library is the only one with first-class text-format support. |
| `tiktoken` (already pinned) | Token counting for context-window math | Already used by the V3 `ContextWindowManager`. The V4 `BillableRecorder` will reuse it for the embedding path so the cost estimate is exact, not heuristic. |

### What is intentionally NOT added

* **No Datadog / New Relic / Honeycomb SDK.** The OTel
  Collector routes traces to any of them if needed; a
  vendor-specific SDK would couple us to a single backend.
* **No Sentry SDK.** Sentry's Python integration is its own
  exception-tracking world; we keep `BaseAppException` and
  the global exception handler in V4 and revisit Sentry in
  V5 if requested.
* **No OpenTelemetry Logs SDK.** We use structlog + the
  `_add_trace_ids` processor to attach `trace_id` /
  `span_id` to every log line. The OTel Logs SDK is
  optional and not required for the V4 deliverables.
* **No OpenSearch / ELK SDK.** Logs go to stdout; whatever
  scrapes stdout (Fluent Bit, Vector, the OTel Collector)
  is the operator's choice.

### Why OTLP/HTTP and not OTLP/gRPC

The Cortex V4 spec calls for OTLP/HTTP. gRPC has two
operational disadvantages:

* Corporate proxies and load balancers routinely break
  HTTP/2 trailers, which gRPC relies on.
* gRPC clients open long-lived connections, which break
  through egress firewalls that expect short-lived HTTP.

OTLP/HTTP is a POST-per-batch of spans, no trailers, no
long-lived sockets. A future migration to gRPC is a
one-line exporter swap.

### Why a private `CollectorRegistry` and not the default global

`prometheus_client` registers Python-interpreter-level
metrics on the default global registry. Any third-party
library that calls `Counter("foo", "...")` pollutes that
registry. V4 creates a dedicated `CollectorRegistry` in
`src/observability/infrastructure/metrics.py` and registers
every Cortex metric on it; the `/metrics` route renders
*only* that registry. The result is a predictable,
auditable, non-polluted exposition.

### Auto-instrumentation is gated on `component != "none"`

`configure_tracing(component="none")` is the explicit opt-out
the unit test suite uses. The instrumentation packages are
imported lazily inside `_instrument_sqlalchemy()` /
`_instrument_redis()` / `_instrument_httpx()` so a missing
optional dep doesn't break the rest of the application.

## Consequences

- `pip install -e .` pulls in 11 new packages (the 9 OTel
  packages + structlog + prometheus-client). The total
  cold-install size is roughly 20 MB. Acceptable for a
  service deployment.
- Every call site that does `tracer.start_as_current_span(...)`
  works whether or not the SDK is configured — the OTel
  API is no-op when no `TracerProvider` is installed. This
  is critical for the test suite, which imports the
  application code without booting the SDK.
- The `service.name` resource attribute distinguishes API
  (`cortex-api`) from worker (`cortex-worker`) from
  evaluator (`cortex-evaluator`). The trace backend can
  group on this attribute.
- Swapping the OTLP backend (Collector → Jaeger → Tempo →
  vendor-specific) is a one-line environment-variable
  change: `OTEL_EXPORTER_OTLP_ENDPOINT`.

## References

- OpenTelemetry semantic conventions: <https://opentelemetry.io/docs/specs/semconv/>
- OTel GenAI SIG: <https://github.com/open-telemetry/semantic-conventions/tree/main/docs/gen-ai>
- ADR-0019: LLM provider abstraction (same OTLP/HTTP choice)
- ADR-0014: Embedding provider (gen_ai.* attributes are the
  Phase 5 contract for embedding spans)
