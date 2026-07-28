"""
Tracing compatibility shim (V3 → V4).

V3 had a single ``tracing.py`` with one helper; V4 replaces
its responsibilities with a structured package:

* :mod:`src.observability.infrastructure.otel`
  (``configure_tracing``, ``get_tracer``, …) — the
  OpenTelemetry SDK integration.
* :mod:`src.observability.infrastructure.genai_spans`
  (``traced_embedding``, ``traced_completion``,
  ``traced_rerank``, ``traced_retrieval``) — typed GenAI
  spans.
* :mod:`src.observability.infrastructure.metrics` —
  Prometheus metrics.
* :mod:`src.core.middleware` — HTTP server / X-Request-ID
  middleware.

This module re-exports the public surface so existing V3
imports keep working. The shim is *thin* — it just
re-exports; do not add new helpers here.
"""

from src.observability.infrastructure.otel import (
    configure_tracing,
    get_tracer,
    service_name_for,
    shutdown_tracing,
)
from src.observability.infrastructure.genai_spans import (
    traced_completion,
    traced_embedding,
    traced_rerank,
    traced_retrieval,
)


__all__ = [
    "configure_tracing",
    "get_tracer",
    "service_name_for",
    "shutdown_tracing",
    "traced_completion",
    "traced_embedding",
    "traced_rerank",
    "traced_retrieval",
]
