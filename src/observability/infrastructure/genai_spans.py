"""
GenAI trace helpers — the typed spans every LLM-shaped call
emits.

Three span kinds, one helper per kind:

* :func:`traced_embedding` — wraps an OpenAI / Anthropic /
  Voyage / local embedding call. Sets ``gen_ai.embedding.*``
  attributes on a child span of the current trace.
* :func:`traced_completion` — wraps an LLM ``chat.completions``
  call. Sets ``gen_ai.chat.*`` attributes.
* :func:`traced_rerank` — wraps a reranker call. Sets
  ``gen_ai.rerank.*`` attributes (a non-standard extension
  that the OTel GenAI SIG is converging on; we use the same
  naming for consistency).

We *also* expose a thin :func:`traced_retrieval` helper for
the application service that orchestrates the whole hybrid
search; it just creates a parent span with the right name
and the application code is responsible for the child spans.

Anti-corruption:

* Span attributes never carry the full input text or
  document content. We hash the input where correlation is
  useful (``gen_ai.embedding.input.content_hash``) and use
  token counts / dimensions / batch size for the rest.
* Cost and token counters in this module are best-effort.
  The real cost calculation lives in
  :mod:`src.billing.application.cost_calculator`; the values
  in span attributes are rounded estimates good enough for
  dashboards.
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from src.observability.infrastructure.otel import get_tracer


_TRACER_NAME = "cortex.genai"


def _content_hash(texts: list[str]) -> str:
    """Stable SHA-256 over the joined content. Used for
    correlation between span events and stored usage events
    without ever putting the raw text on a span.
    """
    joined = "\n".join(texts).encode("utf-8")
    return hashlib.sha256(joined).hexdigest()


# --- embeddings -------------------------------------------------------------


@contextmanager
def traced_embedding(
    *,
    provider: str,
    model: str,
    inputs: list[str],
    dimensions: int,
    estimated_cost_usd: float = 0.0,
) -> Iterator[dict[str, Any]]:
    """
    Wrap an embedding call in a typed span.

    Yields a mutable dict the caller can populate with
    *post-call* attributes (input_tokens, output_vectors, …)
    that aren't known until the provider responds.
    """
    tracer = get_tracer(_TRACER_NAME)
    with tracer.start_as_current_span(
        f"gen_ai.embedding {model}",
        attributes={
            "gen_ai.system": provider,
            "gen_ai.request.model": model,
            "gen_ai.embedding.dimensions": dimensions,
            "gen_ai.embedding.input_count": len(inputs),
            # Hash for correlation, never the content itself.
            "gen_ai.embedding.input.content_hash": _content_hash(inputs),
            # Cost estimate. Best-effort; the canonical value
            # lives in the usage_events table.
            "gen_ai.usage.cost_usd.estimated": float(estimated_cost_usd),
        },
    ) as span:
        start = time.perf_counter()
        attrs: dict[str, Any] = {
            "input_tokens": 0,
            "output_vectors": 0,
        }
        try:
            yield attrs
        except Exception as exc:
            span.record_exception(exc)
            raise
        finally:
            elapsed = time.perf_counter() - start
            span.set_attribute("gen_ai.embedding.input_tokens", int(attrs["input_tokens"]))
            span.set_attribute(
                "gen_ai.embedding.output_vectors", int(attrs["output_vectors"])
            )
            span.set_attribute("gen_ai.embedding.duration_ms", round(elapsed * 1000, 2))
            if estimated_cost_usd:
                span.set_attribute(
                    "gen_ai.usage.cost_usd.actual", float(estimated_cost_usd)
                )


# --- completions -----------------------------------------------------------


@contextmanager
def traced_completion(
    *,
    provider: str,
    model: str,
    operation: str = "chat",
    temperature: float | None = None,
    conversation_id: str | None = None,
    tenant_id: str | None = None,
) -> Iterator[dict[str, Any]]:
    """
    Wrap a generation call in a typed span.

    Yields a mutable dict the caller populates with usage
    data once the provider responds (``input_tokens``,
    ``output_tokens``, ``finish_reason``, ``cost_usd``).
    """
    tracer = get_tracer(_TRACER_NAME)
    attrs: dict[str, Any] = {
        "input_tokens": 0,
        "output_tokens": 0,
        "finish_reason": "stop",
        "cost_usd": 0.0,
    }
    with tracer.start_as_current_span(
        f"gen_ai.chat {model}",
        attributes={
            "gen_ai.system": provider,
            "gen_ai.request.model": model,
            "gen_ai.operation.name": operation,
            "gen_ai.request.temperature": float(temperature or 0.0),
            # High-cardinality *but* tracing (not metric)
            # attributes. Span backends handle them fine.
            "cortex.tenant_id": str(tenant_id) if tenant_id else "",
            "cortex.conversation_id": str(conversation_id) if conversation_id else "",
        },
    ) as span:
        start = time.perf_counter()
        try:
            yield attrs
        except Exception as exc:
            span.record_exception(exc)
            raise
        finally:
            elapsed = time.perf_counter() - start
            span.set_attribute("gen_ai.usage.input_tokens", int(attrs["input_tokens"]))
            span.set_attribute("gen_ai.usage.output_tokens", int(attrs["output_tokens"]))
            span.set_attribute(
                "gen_ai.usage.total_tokens",
                int(attrs["input_tokens"]) + int(attrs["output_tokens"]),
            )
            span.set_attribute(
                "gen_ai.response.finish_reason", str(attrs["finish_reason"])
            )
            span.set_attribute("gen_ai.chat.duration_ms", round(elapsed * 1000, 2))
            if attrs["cost_usd"]:
                span.set_attribute("gen_ai.usage.cost_usd", float(attrs["cost_usd"]))


# --- reranking -------------------------------------------------------------


@contextmanager
def traced_rerank(
    *,
    provider: str,
    model: str,
    candidate_count: int,
) -> Iterator[dict[str, Any]]:
    """
    Wrap a reranker call. Yields a mutable dict the caller
    populates with post-call data (``input_tokens``,
    ``selected_count``, ``cost_usd``).
    """
    tracer = get_tracer(_TRACER_NAME)
    attrs: dict[str, Any] = {
        "input_tokens": 0,
        "selected_count": 0,
        "cost_usd": 0.0,
    }
    with tracer.start_as_current_span(
        f"gen_ai.rerank {model}",
        attributes={
            "gen_ai.system": provider,
            "gen_ai.request.model": model,
            "gen_ai.rerank.candidate_count": int(candidate_count),
        },
    ) as span:
        start = time.perf_counter()
        try:
            yield attrs
        except Exception as exc:
            span.record_exception(exc)
            raise
        finally:
            elapsed = time.perf_counter() - start
            span.set_attribute("gen_ai.rerank.input_tokens", int(attrs["input_tokens"]))
            span.set_attribute(
                "gen_ai.rerank.selected_count", int(attrs["selected_count"])
            )
            span.set_attribute("gen_ai.rerank.duration_ms", round(elapsed * 1000, 2))
            if attrs["cost_usd"]:
                span.set_attribute("gen_ai.rerank.cost_usd", float(attrs["cost_usd"]))


# --- retrieval (parent span) ----------------------------------------------


@contextmanager
def traced_retrieval(
    *,
    tenant_id: str | None = None,
    query_hash: str | None = None,
) -> Iterator[None]:
    """
    Create a parent ``retrieve_context`` span. The application
    code emits child spans (query_embedding, vector_search,
    keyword_search, fusion, rerank) under this parent so a
    single RAG request renders as one tree in the trace
    viewer.
    """
    tracer = get_tracer(_TRACER_NAME)
    with tracer.start_as_current_span(
        "retrieve_context",
        attributes={
            "cortex.tenant_id": str(tenant_id) if tenant_id else "",
            "cortex.retrieval.query_hash": str(query_hash) if query_hash else "",
        },
    ):
        yield


__all__ = [
    "traced_completion",
    "traced_embedding",
    "traced_rerank",
    "traced_retrieval",
]
