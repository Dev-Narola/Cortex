"""
OpenTelemetry tracing helpers for the knowledge-graph bounded context.

The agentic layer (``src.agents.application.observability``) is the
template this module follows. The shape is small on
purpose: one helper per spec'd span so the rest of
the codebase never has to know the OTel API.

The spans cover the V7 Part 3 Phase 11 tree:

    extract_entities
    extract_relationships
    save_graph
    graph_extraction_document    (root span)
    graph_traversal_query         (BFS / search)
    graph_retrieval               (fusion)

The helpers are no-ops when OTel is not configured
(the V4 tracer returns a no-op tracer in that
case), so the call sites can use them
unconditionally without a ``try/except``.

This module is intentionally tiny. The actual
decision about *what* to record lives in the
extraction / traversal / retrieval services
which know when each span starts and stops — this
module is the seam between those services and the
OTel API.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from src.observability.infrastructure.otel import get_tracer

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Spans
# ---------------------------------------------------------------------------


@contextmanager
def graph_extraction_span(
    *,
    tenant_id: str,
    document_id: str,
) -> Iterator[Any]:
    """Open the root span for a per-document extraction.

    The span name follows the OTel GenAI
    convention: ``extract_graph <document>``. The
    child spans (``extract_entities``,
    ``extract_relationships``, ``save_graph``)
    are opened inside this span.
    """
    tracer = get_tracer("cortex.knowledge_graph")
    with tracer.start_as_current_span(
        f"extract_graph {document_id}",
        attributes={
            "gen_ai.operation.name": "extract_graph",
            "tenant_id": tenant_id,
            "document_id": document_id,
        },
    ) as span:
        span.set_attribute("kg.document_id", document_id)
        yield span


@contextmanager
def extract_entities_span(
    *,
    chunk_id: str,
) -> Iterator[Any]:
    """Open a child span for the entity-extraction LLM call."""
    tracer = get_tracer("cortex.knowledge_graph")
    with tracer.start_as_current_span(
        f"extract_entities {chunk_id}",
        attributes={
            "code.function": "extract_entities",
            "kg.chunk_id": chunk_id,
        },
    ) as span:
        yield span


@contextmanager
def extract_relationships_span(
    *,
    chunk_id: str,
) -> Iterator[Any]:
    """Open a child span for the relationship-extraction LLM call."""
    tracer = get_tracer("cortex.knowledge_graph")
    with tracer.start_as_current_span(
        f"extract_relationships {chunk_id}",
        attributes={
            "code.function": "extract_relationships",
            "kg.chunk_id": chunk_id,
        },
    ) as span:
        yield span


@contextmanager
def save_graph_span(
    *,
    chunk_id: str,
) -> Iterator[Any]:
    """Open a child span for the graph-write phase (entities + relations)."""
    tracer = get_tracer("cortex.knowledge_graph")
    with tracer.start_as_current_span(
        f"save_graph {chunk_id}",
        attributes={
            "code.function": "save_graph",
            "kg.chunk_id": chunk_id,
        },
    ) as span:
        yield span


@contextmanager
def graph_traversal_span(
    *,
    tenant_id: str,
    algorithm: str,
    entity_id: str | None = None,
) -> Iterator[Any]:
    """Open a span for a BFS / search traversal."""
    tracer = get_tracer("cortex.knowledge_graph")
    attributes: dict[str, Any] = {
        "gen_ai.operation.name": "graph_traversal",
        "tenant_id": tenant_id,
        "kg.algorithm": algorithm,
    }
    if entity_id is not None:
        attributes["kg.entity_id"] = entity_id
    with tracer.start_as_current_span(
        f"graph_traversal {algorithm}",
        attributes=attributes,
    ) as span:
        yield span


@contextmanager
def graph_retrieval_span(
    *,
    tenant_id: str,
    query: str,
) -> Iterator[Any]:
    """Open a span for a graph-aware retrieval call."""
    tracer = get_tracer("cortex.knowledge_graph")
    with tracer.start_as_current_span(
        "graph_retrieval",
        attributes={
            "gen_ai.operation.name": "graph_retrieval",
            "tenant_id": tenant_id,
            "kg.query_length": len(query or ""),
        },
    ) as span:
        yield span


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def _safe_record(call: "Any") -> None:
    """Run a metrics callback, swallow any failure.

    Observability is best-effort. A missing
    Prometheus client or a closed registry
    must never break a request.
    """
    try:
        call()
    except Exception:  # noqa: BLE001
        return


def record_extraction_duration(
    *,
    outcome: str,
    duration_seconds: float,
) -> None:
    """Bump the per-outcome extraction-latency histogram."""
    def _do() -> None:
        from src.observability.infrastructure.metrics import (
            GRAPH_EXTRACTION_DURATION_SECONDS,
        )
        GRAPH_EXTRACTION_DURATION_SECONDS.labels(outcome=outcome).observe(
            duration_seconds
        )
    _safe_record(_do)


def record_traversal_depth(
    *,
    algorithm: str,
    depth: int,
) -> None:
    """Bump the per-algorithm traversal-depth histogram."""
    def _do() -> None:
        from src.observability.infrastructure.metrics import (
            GRAPH_TRAVERSAL_DEPTH,
        )
        GRAPH_TRAVERSAL_DEPTH.labels(algorithm=algorithm).observe(depth)
    _safe_record(_do)


def record_extraction_tokens(
    *,
    prompt_tokens: int,
    completion_tokens: int,
) -> None:
    """Bump the per-extraction LLM token counter."""
    def _do() -> None:
        from src.observability.infrastructure.metrics import (
            GRAPH_LLM_EXTRACTION_TOKENS_TOTAL,
        )
        GRAPH_LLM_EXTRACTION_TOKENS_TOTAL.labels().inc(
            prompt_tokens + completion_tokens
        )
    _safe_record(_do)


# Convenience: a single ``timed_extraction`` context
# manager that wraps the whole extraction and records
# the duration. The context manager does not open
# the OTel span (caller chooses to do that with
# :func:`graph_extraction_span`) — it just times
# the block.
@contextmanager
def timed_extraction() -> Iterator[dict[str, Any]]:
    """Time the body of a graph extraction and record the duration.

    Yields a state dict the caller can use to
    attach an outcome to the timer (``state
    ["outcome"] = "failure"`` before re-raising
    inside the ``with`` block, for example). The
    context manager reads the outcome on exit
    and calls :func:`record_extraction_duration`
    with it.
    """
    state: dict[str, Any] = {"outcome": "success"}
    started = time.perf_counter()
    try:
        yield state
    except Exception:
        state["outcome"] = "failure"
        raise
    finally:
        record_extraction_duration(
            outcome=state["outcome"],
            duration_seconds=time.perf_counter() - started,
        )


__all__ = [
    "extract_entities_span",
    "extract_relationships_span",
    "graph_extraction_span",
    "graph_retrieval_span",
    "graph_traversal_span",
    "record_extraction_duration",
    "record_extraction_tokens",
    "record_traversal_depth",
    "save_graph_span",
    "timed_extraction",
]
