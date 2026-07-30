"""
Central Prometheus metrics registry.

Every metric the V4 system exposes lives here. The registry is
a module-level singleton (the ``prometheus_client`` library
makes that the natural shape) so any module can call
``HTTP_REQUESTS_TOTAL.labels(...).inc()`` without first
constructing a registry.

Why *one* file and not "one module per metric group":

* Cardinality decisions (which labels are allowed, which
  aren't) are easier to audit when they're all in the same
  place. Mixing the labels across five files is how you end
  up with ``cortex_llm_calls_total{tenant_id=...}`` blowing
  up Prometheus.
* The `/metrics` endpoint renders whatever is in the default
  registry; a single source of truth makes the exposition
  predictable.

Label cardinality discipline:

* Allowed: ``method``, ``route``, ``status_code``,
  ``provider``, ``model``, ``operation``, ``task_name``,
  ``cache_type``. These have small, finite value sets.
* Disallowed: ``tenant_id``, ``user_id``, ``conversation_id``,
  ``document_id``, ``chunk_id``. High-cardinality identifiers
  belong in **traces** (where each one is a row) and
  **usage_events** (where each one is a row), not in metric
  labels.
"""

from __future__ import annotations

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram
from prometheus_client.exposition import (
    CONTENT_TYPE_LATEST,
    generate_latest,
)


# A dedicated registry keeps the metrics isolated from any
# third-party library (sqlalchemy, fastapi, etc.) that might
# register its own default metrics. The ``/metrics`` route
# renders exactly this one.
REGISTRY = CollectorRegistry(auto_describe=True)


# --- HTTP -------------------------------------------------------------------
#
# ``route`` is the *template* (e.g. ``/api/documents/{id}``),
# not the raw URL. The tracing middleware in
# :mod:`src.core.middleware` populates this from the matched
# route, so we never get ``/api/documents/8f3...`` as a label
# value.

HTTP_REQUESTS_TOTAL = Counter(
    "cortex_http_requests_total",
    "HTTP requests served, labelled by method, route template, and status code.",
    labelnames=("method", "route", "status_code"),
    registry=REGISTRY,
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "cortex_http_request_duration_seconds",
    "HTTP request latency in seconds, labelled by method, route template, and status code.",
    labelnames=("method", "route", "status_code"),
    buckets=(
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5,
        1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0,
    ),
    registry=REGISTRY,
)

HTTP_REQUESTS_IN_FLIGHT = Gauge(
    "cortex_http_requests_in_flight",
    "HTTP requests currently being processed.",
    labelnames=("method", "route"),
    registry=REGISTRY,
)


# --- Retrieval -------------------------------------------------------------


RETRIEVAL_REQUESTS_TOTAL = Counter(
    "cortex_retrieval_requests_total",
    "Hybrid-search requests, labelled by stage and outcome.",
    labelnames=("stage", "outcome"),  # stage: vector/keyword/fusion/rerank
    registry=REGISTRY,
)

RETRIEVAL_DURATION_SECONDS = Histogram(
    "cortex_retrieval_duration_seconds",
    "Hybrid-search latency, labelled by stage.",
    labelnames=("stage",),
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
    registry=REGISTRY,
)

RETRIEVAL_RESULTS_COUNT = Histogram(
    "cortex_retrieval_results_count",
    "Number of chunks returned per retrieval, labelled by stage.",
    labelnames=("stage",),
    buckets=(0, 1, 5, 10, 20, 30, 50, 100),
    registry=REGISTRY,
)


# --- LLM --------------------------------------------------------------------


LLM_CALLS_TOTAL = Counter(
    "cortex_llm_calls_total",
    "LLM (or other generative) calls, labelled by provider, model, operation, and status.",
    labelnames=("provider", "model", "operation", "status"),
    registry=REGISTRY,
)

LLM_LATENCY_SECONDS = Histogram(
    "cortex_llm_latency_seconds",
    "LLM call latency, labelled by provider, model, and operation.",
    labelnames=("provider", "model", "operation"),
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0),
    registry=REGISTRY,
)

LLM_INPUT_TOKENS_TOTAL = Counter(
    "cortex_llm_input_tokens_total",
    "Input (prompt) tokens consumed by the LLM, by provider, model, and operation.",
    labelnames=("provider", "model", "operation"),
    registry=REGISTRY,
)

LLM_OUTPUT_TOKENS_TOTAL = Counter(
    "cortex_llm_output_tokens_total",
    "Output (completion) tokens produced by the LLM, by provider, model, and operation.",
    labelnames=("provider", "model", "operation"),
    registry=REGISTRY,
)

LLM_COST_TOTAL = Counter(
    "cortex_llm_cost_total",
    "Estimated cost in USD consumed by the LLM, by provider and model.",
    labelnames=("provider", "model"),
    registry=REGISTRY,
)


# --- Embedding -------------------------------------------------------------


EMBEDDING_CALLS_TOTAL = Counter(
    "cortex_embedding_calls_total",
    "Embedding calls, labelled by provider, model, and outcome.",
    labelnames=("provider", "model", "outcome"),
    registry=REGISTRY,
)

EMBEDDING_TOKENS_TOTAL = Counter(
    "cortex_embedding_tokens_total",
    "Input tokens sent to the embedding model, by provider and model.",
    labelnames=("provider", "model"),
    registry=REGISTRY,
)

EMBEDDING_VECTORS_TOTAL = Counter(
    "cortex_embedding_vectors_total",
    "Number of vectors produced by embedding calls, by provider and model.",
    labelnames=("provider", "model"),
    registry=REGISTRY,
)

EMBEDDING_DURATION_SECONDS = Histogram(
    "cortex_embedding_duration_seconds",
    "Embedding call latency, by provider and model.",
    labelnames=("provider", "model"),
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
    registry=REGISTRY,
)

EMBEDDING_CACHE_HITS_TOTAL = Counter(
    "cortex_embedding_cache_hits_total",
    "Embedding cache hits, by provider and model.",
    labelnames=("provider", "model"),
    registry=REGISTRY,
)

EMBEDDING_CACHE_MISSES_TOTAL = Counter(
    "cortex_embedding_cache_misses_total",
    "Embedding cache misses, by provider and model.",
    labelnames=("provider", "model"),
    registry=REGISTRY,
)


# --- Reranking -------------------------------------------------------------


RERANK_CALLS_TOTAL = Counter(
    "cortex_rerank_calls_total",
    "Reranker calls, labelled by provider, model, and outcome.",
    labelnames=("provider", "model", "outcome"),
    registry=REGISTRY,
)

RERANK_DURATION_SECONDS = Histogram(
    "cortex_rerank_duration_seconds",
    "Reranker call latency, by provider and model.",
    labelnames=("provider", "model"),
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
    registry=REGISTRY,
)

RERANK_CANDIDATES_TOTAL = Counter(
    "cortex_rerank_candidates_total",
    "Number of candidates passed to the reranker, by provider and model.",
    labelnames=("provider", "model"),
    registry=REGISTRY,
)


# --- Worker ----------------------------------------------------------------


WORKER_TASKS_TOTAL = Counter(
    "cortex_worker_tasks_total",
    "Background worker tasks, labelled by task name and outcome.",
    labelnames=("task_name", "outcome"),  # outcome: success/failure/retry
    registry=REGISTRY,
)

WORKER_TASK_DURATION_SECONDS = Histogram(
    "cortex_worker_task_duration_seconds",
    "Background worker task latency, by task name.",
    labelnames=("task_name",),
    buckets=(0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 300.0, 600.0),
    registry=REGISTRY,
)

WORKER_TASK_FAILURES_TOTAL = Counter(
    "cortex_worker_task_failures_total",
    "Background worker task failures, by task name and error type.",
    labelnames=("task_name", "error_type"),
    registry=REGISTRY,
)

WORKER_TASK_RETRIES_TOTAL = Counter(
    "cortex_worker_task_retries_total",
    "Background worker task retries, by task name.",
    labelnames=("task_name",),
    registry=REGISTRY,
)


# --- Cache -----------------------------------------------------------------


REDIS_CACHE_HITS_TOTAL = Counter(
    "cortex_redis_cache_hits_total",
    "Redis cache hits, labelled by cache type.",
    labelnames=("cache_type",),  # cache_type: embedding/search/rate_limit
    registry=REGISTRY,
)

REDIS_CACHE_MISSES_TOTAL = Counter(
    "cortex_redis_cache_misses_total",
    "Redis cache misses, labelled by cache type.",
    labelnames=("cache_type",),
    registry=REGISTRY,
)


# --- Pipeline stage timings (V4 Phase 19) ---------------------------------


PIPELINE_STAGE_DURATION_SECONDS = Histogram(
    "cortex_pipeline_stage_duration_seconds",
    "Per-stage duration of the RAG answer pipeline, by stage name. "
    "Stages: query_embedding, vector_search, keyword_search, fusion, "
    "rerank, context_construction, llm_first_token, llm_total. "
    "The histogram is the source of truth for the p95 / first-token "
    "latency targets in Docs/adr/0024-performance-baseline.md.",
    labelnames=("stage",),
    buckets=(
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5,
        1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0,
    ),
    registry=REGISTRY,
)


# --- Usage recording (V4 Phase 14) -----------------------------------------


USAGE_RECORDING_FAILURES_TOTAL = Counter(
    "cortex_usage_recording_failures_total",
    "Usage-event recording failures, by event type / provider / model. "
    "Increments when the UsageService fails to persist a usage event; "
    "in strict mode the upstream caller continues (the LLM call has "
    "already succeeded) and the counter is the operator's signal that "
    "billing is leaking.",
    labelnames=("event_type", "provider", "model"),
    registry=REGISTRY,
)


# --- Audit recording (V4 Phase 15) -----------------------------------------


AUDIT_RECORDING_FAILURES_TOTAL = Counter(
    "cortex_audit_recording_failures_total",
    "Audit-event recording failures, by action. "
    "Increments when the AuditService fails to append a row; "
    "in strict mode (the default) the upstream caller catches, "
    "logs at CRITICAL, and continues — but the counter is the "
    "operator's signal that the audit trail has a gap.",
    labelnames=("action",),
    registry=REGISTRY,
)


# --- Knowledge Graph (V7) ---------------------------------------------------


KG_ENTITIES_EXTRACTED_TOTAL = Counter(
    "cortex_kg_entities_extracted_total",
    "Total entities extracted for Knowledge Graph.",
    registry=REGISTRY,
)

KG_RELATIONSHIPS_EXTRACTED_TOTAL = Counter(
    "cortex_kg_relationships_extracted_total",
    "Total relationships extracted for Knowledge Graph.",
    registry=REGISTRY,
)

KG_EXTRACTION_FAILURES_TOTAL = Counter(
    "cortex_kg_extraction_failures_total",
    "Total Knowledge Graph extraction failures.",
    registry=REGISTRY,
)

KG_PIPELINE_RUNS_TOTAL = Counter(
    "cortex_kg_pipeline_runs_total",
    "Total Knowledge Graph pipeline runs.",
    registry=REGISTRY,
)

GRAPH_QUERIES_TOTAL = Counter(
    "cortex_graph_queries_total",
    "Total Knowledge Graph queries executed.",
    registry=REGISTRY,
)

GRAPH_TRAVERSAL_DURATION_SECONDS = Histogram(
    "cortex_graph_traversal_duration_seconds",
    "Knowledge Graph traversal query latency in seconds.",
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
    registry=REGISTRY,
)

GRAPH_RETRIEVAL_DURATION_SECONDS = Histogram(
    "cortex_graph_retrieval_duration_seconds",
    "Graph-aware retrieval latency in seconds.",
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
    registry=REGISTRY,
)

GRAPH_LLM_EXTRACTION_TOKENS_TOTAL = Counter(
    "cortex_graph_llm_extraction_tokens_total",
    "Tokens consumed during Knowledge Graph LLM extractions.",
    registry=REGISTRY,
)

# --- V7 Part 3: extra metrics called out by the Phase 11 spec ----

GRAPH_EXTRACTION_DURATION_SECONDS = Histogram(
    "cortex_graph_extraction_duration_seconds",
    "End-to-end knowledge graph extraction latency, labelled by outcome.",
    labelnames=("outcome",),  # outcome: success / failure
    buckets=(
        0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0,
    ),
    registry=REGISTRY,
)

GRAPH_TRAVERSAL_DEPTH = Histogram(
    "cortex_graph_traversal_depth",
    "Distribution of BFS traversal depths, labelled by algorithm. "
    "Used to spot tenants whose graphs have grown past the depth cap.",
    labelnames=("algorithm",),  # algorithm: shortest_path / related_entities
    buckets=(0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20),
    registry=REGISTRY,
)


# --- Exposition ------------------------------------------------------------


def render_latest() -> tuple[bytes, str]:
    """Return the Prometheus exposition payload.

    The shape matches the standard ``GET /metrics`` contract:
    a UTF-8 byte string and the corresponding
    ``Content-Type`` header value.
    """
    return generate_latest(REGISTRY), CONTENT_TYPE_LATEST


__all__ = [
    "EMBEDDING_CACHE_HITS_TOTAL",
    "EMBEDDING_CACHE_MISSES_TOTAL",
    "EMBEDDING_CALLS_TOTAL",
    "EMBEDDING_DURATION_SECONDS",
    "EMBEDDING_TOKENS_TOTAL",
    "EMBEDDING_VECTORS_TOTAL",
    "HTTP_REQUESTS_IN_FLIGHT",
    "HTTP_REQUEST_DURATION_SECONDS",
    "HTTP_REQUESTS_TOTAL",
    "LLM_CALLS_TOTAL",
    "LLM_COST_TOTAL",
    "LLM_INPUT_TOKENS_TOTAL",
    "LLM_LATENCY_SECONDS",
    "LLM_OUTPUT_TOKENS_TOTAL",
    "PIPELINE_STAGE_DURATION_SECONDS",
    "REDIS_CACHE_HITS_TOTAL",
    "REDIS_CACHE_MISSES_TOTAL",
    "USAGE_RECORDING_FAILURES_TOTAL",
    "AUDIT_RECORDING_FAILURES_TOTAL",
    "KG_ENTITIES_EXTRACTED_TOTAL",
    "KG_RELATIONSHIPS_EXTRACTED_TOTAL",
    "KG_EXTRACTION_FAILURES_TOTAL",
    "KG_PIPELINE_RUNS_TOTAL",
    "GRAPH_QUERIES_TOTAL",
    "GRAPH_TRAVERSAL_DURATION_SECONDS",
    "GRAPH_RETRIEVAL_DURATION_SECONDS",
    "GRAPH_LLM_EXTRACTION_TOKENS_TOTAL",
    "REGISTRY",
    "RERANK_CALLS_TOTAL",
    "RERANK_CANDIDATES_TOTAL",
    "RERANK_DURATION_SECONDS",
    "RETRIEVAL_DURATION_SECONDS",
    "RETRIEVAL_REQUESTS_TOTAL",
    "RETRIEVAL_RESULTS_COUNT",
    "WORKER_TASK_DURATION_SECONDS",
    "WORKER_TASK_FAILURES_TOTAL",
    "WORKER_TASK_RETRIES_TOTAL",
    "WORKER_TASKS_TOTAL",
    "render_latest",
]

