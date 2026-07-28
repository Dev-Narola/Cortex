# ADR-0026: V4 observability example — anatomy of one request

**Status:** Accepted (V4)
**Date:** 2026-07-27
**Related:** [ADR-0022](0022-otel-dependency-set.md), [ADR-0023](0023-usage-events-and-cost-model.md), [ADR-0024](0024-performance-baseline.md), [ADR-0025](0025-coverage-policy.md)

## Context

V3 could answer a question. V4 has to *prove* it answered the
question — for what model, with what cost, in how much time,
over what retrieved context, and whether the answer was
grounded. The V4 brief calls out a specific example trace
tree (Phase 28) that the system has to be able to produce
end-to-end. This ADR captures what that trace looks like in
practice, what spans and attributes it carries, and the
side effects (metrics + usage events + audit + logs) that
travel with it.

The example below is **what a single tenant conversation
turn looks like in production after V4**. It is the
canonical reference a future operator reads to understand
"what does V4 observability actually give me?".

## The trace tree

A single ``POST /conversations/{id}/messages`` request
that triggers a real answer produces a tree with the
following shape (abridged — only the V4-specific spans are
shown, with the OTel ``name`` and the most important
attributes):

```
Trace  7b8f3a1c0d2e4f5b...
├── HTTP server span
│     name      : "POST /api/v1/conversations/{id}/messages"
│     kind      : SERVER
│     attributes: { http.method=POST, http.route=...,
│                   http.status_code=200, tenant_id=...,
│                   user_id=... }
│
├── authenticate_user                  (application span)
│     name      : "authenticate_user"
│     kind      : INTERNAL
│     attributes: { authn.method=jwt, authn.subject=... }
│
├── answer_query                       (application span)
│     name      : "answer_query"
│     kind      : INTERNAL
│     attributes: { conversation.id=..., query.length=142 }
│
│   ├── retrieve_context               (application span)
│   │     name      : "retrieve_context"
│   │     attributes: { retrieval.strategy=hybrid,
│   │                   retrieval.top_k=20,
│   │                   retrieval.rerank=true }
│   │
│   │   ├── embedding                  (GenAI span)
│   │   │     name      : "embedding"
│   │   │     kind      : CLIENT
│   │   │     attributes: { gen_ai.system=openai,
│   │   │                   gen_ai.request.model=text-embedding-3-small,
│   │   │                   gen_ai.usage.input_tokens=14_200,
│   │   │                   cortex.cost_usd=0.000226 }
│   │   │     side effects:
│   │   │       • cortex_embedding_calls_total{provider,model} += 1
│   │   │       • cortex_embedding_tokens_total{model}    += 14_200
│   │   │       • usage_events row (event_type=embedding, model=...)
│   │   │
│   │   ├── vector_search              (DB span)
│   │   │     name      : "SELECT ... FROM chunks ORDER BY embedding <-> ..."
│   │   │     kind      : CLIENT
│   │   │     attributes: { db.system=postgresql,
│   │   │                   db.statement=...,
│   │   │                   cortex.retrieval.strategy=vector,
│   │   │                   cortex.retrieval.results=20 }
│   │   │
│   │   ├── keyword_search             (DB span)
│   │   │     name      : "SELECT ... FROM chunks WHERE tsvector @@ ..."
│   │   │     kind      : CLIENT
│   │   │     attributes: { db.system=postgresql,
│   │   │                   cortex.retrieval.strategy=keyword,
│   │   │                   cortex.retrieval.results=18 }
│   │   │
│   │   ├── rrf_fusion                 (application span)
│   │   │     name      : "rrf_fusion"
│   │   │     attributes: { retrieval.rrf_k=60,
│   │   │                   retrieval.merged=22 }
│   │   │
│   │   └── rerank                     (GenAI span)
│   │         name      : "rerank"
│   │         kind      : CLIENT
│   │         attributes: { gen_ai.system=cohere,
│   │                   gen_ai.request.model=rerank-english-v3.0,
│   │                   gen_ai.usage.input_tokens=4_120,
│   │                   cortex.retrieval.candidates=22,
│   │                   cortex.retrieval.kept=8,
│   │                   cortex.cost_usd=0.002000 }
│   │         side effects:
│   │           • cortex_rerank_calls_total{model}       += 1
│   │           • cortex_rerank_candidates_total{model}   += 22
│   │           • usage_events row (event_type=rerank, ...)
│   │
│   └── completion                     (GenAI span)
│         name      : "completion"
│         kind      : CLIENT
│         attributes: { gen_ai.system=openai,
│                       gen_ai.request.model=gpt-4o-mini,
│                       gen_ai.usage.input_tokens=3_200,
│                       gen_ai.usage.output_tokens=600,
│                       cortex.llm.latency_ms=1842,
│                       cortex.cost_usd=0.001230 }
│         side effects:
│           • cortex_llm_calls_total{model}                += 1
│           • cortex_llm_input_tokens_total{model}         += 3_200
│           • cortex_llm_output_tokens_total{model}        +=   600
│           • cortex_llm_cost_total{model}                 += 0.001230
│           • usage_events row (event_type=completion, ...)
│
└── persist_message                    (DB span)
      name      : "INSERT INTO messages ..."
      kind      : CLIENT
      attributes: { db.system=postgresql, db.statement=... }
```

## Side effects (in parallel with the trace)

The same request produces **four parallel, queryable
records** beyond the trace:

### 1. Usage events (the cost record)

After the request:

```
GET /api/v1/tenants/me/usage/summary
```

returns (for the period covering the request):

```json
{
  "period": {"from": "...", "to": "..."},
  "requests": 1,
  "embedding_tokens": 14200,
  "completion_input_tokens": 3200,
  "completion_output_tokens": 600,
  "rerank_units": 22,
  "estimated_cost_usd": 0.003456
}
```

Three ``usage_events`` rows were appended (one per
GenAI call), each carrying its own ``pricing_version``
snapshot so historical invoices remain stable when
rates change (see ADR-0023).

### 2. Logs (the structured record)

A JSON line is emitted for every observable step. The
``trace_id`` field lets a log search pivot to the trace
UI. The ``llm_call_completed`` line for the completion
above is:

```json
{
  "event": "llm_call_completed",
  "level": "info",
  "timestamp": "2026-07-27T08:32:11.014Z",
  "trace_id": "7b8f3a1c0d2e4f5b...",
  "span_id":  "9c0e2a47b1...",
  "tenant_id": "...",
  "user_id":   "...",
  "model": "gpt-4o-mini",
  "input_tokens":  3200,
  "output_tokens":  600,
  "latency_ms":    1842,
  "cost_usd":      0.00123,
  "outcome": "ok"
}
```

No full prompt, no answer text, no API key, no JWT. The
``redact()`` processor in
``src.observability.infrastructure.redaction`` enforces
this at the logger boundary.

### 3. Metrics (the aggregate view)

The same request bumps five Prometheus counters and two
histograms:

```
cortex_http_requests_total{method="POST",route="/api/v1/conversations/{id}/messages",status_code="200"}  +1
cortex_http_request_duration_seconds_bucket{...}                                                          +1
cortex_llm_calls_total{model="gpt-4o-mini"}                                                                +1
cortex_llm_input_tokens_total{model="gpt-4o-mini"}                                                    +3_200
cortex_llm_output_tokens_total{model="gpt-4o-mini"}                                                     +600
cortex_llm_cost_total{model="gpt-4o-mini"}                                                         +0.00123
cortex_llm_latency_seconds_bucket{model="gpt-4o-mini",le="..."}                                          +1
cortex_embedding_calls_total{model="text-embedding-3-small"}                                              +1
cortex_embedding_tokens_total{model="text-embedding-3-small"}                                       +14_200
cortex_rerank_calls_total{model="rerank-english-v3.0"}                                                     +1
cortex_rerank_candidates_total{model="rerank-english-v3.0"}                                              +22
cortex_pipeline_stage_duration_seconds{stage="query_embedding"}  +observation
cortex_pipeline_stage_duration_seconds{stage="vector_search"}     +observation
cortex_pipeline_stage_duration_seconds{stage="keyword_search"}    +observation
cortex_pipeline_stage_duration_seconds{stage="fusion"}            +observation
cortex_pipeline_stage_duration_seconds{stage="rerank"}            +observation
cortex_pipeline_stage_duration_seconds{stage="llm_first_token"}   +observation
cortex_pipeline_stage_duration_seconds{stage="llm_total"}         +observation
```

Note the *absence* of ``tenant_id``, ``user_id``, and
``conversation_id`` labels — see ADR-0027 for the
cardinality rationale.

### 4. Audit (the security record)

A ``conversation_accessed`` row is appended to the
``audit_log`` table (the route layer in
``src.conversation.interface.rest.routes`` calls
``AuditService.record(...)`` with the actor, the
conversation id, and the IP). The row is append-only
— there is no API surface that updates or deletes it.

```
GET /api/v1/audit-log
```

returns it (filtered to ``action=conversation_accessed``)
to admin / owner users.

## Design properties the example exercises

1. **One trace ID, many layers.** The trace ID
   ``7b8f3a1c0d2e4f5b...`` is the same from the HTTP
   span down to the last GenAI span. The provider's own
   HTTPX client span is captured automatically by the
   ``opentelemetry-instrumentation-httpx`` package; the
   parent/child relationship is correct without manual
   context plumbing.

2. **All four observability surfaces agree on the
   timestamp.** Trace, log, metric, and usage event all
   have the same wall-clock anchor (within
   sub-millisecond skew). A future operator can pivot
   from a log line to a trace to a usage row to a
   Grafana panel without reconciling clocks.

3. **PII is absent by construction.** The trace does
   not contain the user's question, the document text,
   or the model's answer. It contains counts
   (``input_tokens=3200``), categorical labels
   (``model="gpt-4o-mini"``), and a cost figure
   (``cost_usd=0.00123``) — *the metadata needed to
   debug, not the data itself*. The redaction layer
   in ``src.observability.infrastructure.redaction``
   enforces this at the JSON boundary.

4. **High-cardinality data lives in rows, not labels.**
   The trace tree contains ``conversation.id``,
   ``chunk.id``, ``document.id``; the metric labels
   do not. The rule is operationalised in
   ``src.observability.infrastructure.metrics``: the
   allowed label set is enumerated in the module
   docstring and *disallowed* identifiers are listed
   in the same comment so a future contributor cannot
   accidentally add a ``tenant_id`` label.

5. **The cost figure is reproducible.** The
   ``usage_events`` row carries the ``pricing_version``
   of the cost calculator at the time of the call
   (see ADR-0023). Two months later, when the pricing
   table is updated, the *old* invoice is unchanged —
   the historical event still says it cost $0.00123 at
   the time of the call.

6. **Latency is per-stage, not per-request.**
   ``cortex_pipeline_stage_duration_seconds`` is
   labelled only by ``stage`` (8 fixed values from
   ``query_embedding`` to ``llm_total``). The p95
   targets in ADR-0024 are computed from this
   histogram.

7. **100% of LLM calls produce a span.** Every
   completion path goes through the
   ``traced_completion()`` context manager in
   ``src.observability.infrastructure.genai_spans``,
   so a span is *unavoidable*. The integration test
   in ``tests/integration/test_observable_rag_flow.py``
   enforces this — a missing span is a test failure.

## Decision

Adopt the trace tree above as the canonical reference
for V4 observability. The four side effects (usage
events, logs, metrics, audit) travel with **every** LLM
request and **every** document / conversation / API-key
operation. The V4 smoke test
(``scripts/smoke_test_observability.py``) and the
integration test
(``tests/integration/test_observable_rag_flow.py``) are
the executable contracts that the system continues to
produce this shape.

## Consequences

* Every GenAI call site **must** go through the
  ``traced_*`` context managers. Lint discipline: a
  bare ``openai.Embedding.create(...)`` without the
  context manager is a bug.
* Every metric label set is reviewed at PR time
  against the cardinality policy in ADR-0027. A new
  ``tenant_id=`` label is a hard reject.
* The audit log grows at a fixed rate per
  privileged action (login, document access, etc.).
  The V4 cost estimate budgets for this; the V5
  decision is whether to roll up the audit log into
  S3 after N days.
* The redaction layer is the single boundary that
  prevents PII leakage. Any code path that bypasses
  it (e.g. a custom log handler) is a security bug.
