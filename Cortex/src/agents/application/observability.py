"""
Observability helpers for the agents bounded context.

The agent loop is the most complex piece of V6 logic,
and the spec calls out observability for it specifically.
The V4 OTel stack (``get_tracer``, ``get_meter``) is the
right surface; this module is a thin wrapper that exposes
one helper per spec'd observability concern so the rest
of the code does not have to know the OTel API:

* :func:`agent_run_span` — context manager that wraps an
  entire ``AgentRun`` in an OTel span. Sets the standard
  ``gen_ai.*`` attributes (operation name, agent id,
  tenant id, model) so the trace backend can group
  agent runs the same way it groups chat calls.
* :func:`agent_iteration_span` — child span for one
  iteration of the loop. Attributes include the
  iteration number, the tool calls made, and the LLM
  token counts.
* :func:`agent_tool_call_span` — child span for one
  tool invocation. Attributes include the tool name,
  duration, and a sanitised summary of the result.
* :func:`record_agent_token_usage` — increments the
  per-tenant token counter via the V4 metrics layer so
  Prometheus picks it up.

The helpers are no-ops when OTel is not configured (the
V4 tracer returns a no-op tracer in that case), so the
executor can call them unconditionally without a
``try/except``.

This module is intentionally tiny. The actual decision
about *what* to record lives in the executor (which
knows when an iteration starts and stops) — this
module is the seam between the executor and the OTel
API.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from src.core.config import settings
from src.observability.infrastructure.otel import get_tracer


# ---------------------------------------------------------------------------
# Spans
# ---------------------------------------------------------------------------


@contextmanager
def agent_run_span(
    *,
    tenant_id: str,
    agent_id: str,
    agent_name: str,
    model: str,
    run_id: str,
) -> Iterator[Any]:
    """Open a top-level span for an agent run.

    Yields the OTel span (so the caller can add
    attributes on completion). The span name follows
    the OTel GenAI convention:
    ``invoke_agent <model>``.
    """
    tracer = get_tracer("cortex.agents")
    with tracer.start_as_current_span(
        f"invoke_agent {model}",
        attributes={
            "gen_ai.operation.name": "invoke_agent",
            "gen_ai.agent.id": agent_id,
            "gen_ai.agent.name": agent_name,
            "gen_ai.system": "cortex",
            "tenant_id": tenant_id,
            "agent_run_id": run_id,
        },
    ) as span:
        span.set_attribute("gen_ai.request.model", model)
        yield span


@contextmanager
def agent_iteration_span(
    *,
    iteration: int,
    run_id: str,
) -> Iterator[Any]:
    """Open a child span for one iteration of the loop.

    Sets ``code.function`` to ``agent_iteration`` so
    trace UIs render this as a recognisable sub-step
    of the parent run.
    """
    tracer = get_tracer("cortex.agents")
    with tracer.start_as_current_span(
        f"agent_iteration {iteration}",
        attributes={
            "code.function": "agent_iteration",
            "agent_run_id": run_id,
            "iteration": iteration,
        },
    ) as span:
        yield span


@contextmanager
def agent_tool_call_span(
    *,
    tool_name: str,
    run_id: str,
) -> Iterator[Any]:
    """Open a child span for one tool invocation.

    Yields a ``(span, timer)`` pair so the caller can
    record the duration. The duration is set on the
    span in the ``finally`` block.
    """
    tracer = get_tracer("cortex.agents")
    started = time.perf_counter()
    with tracer.start_as_current_span(
        f"tool_call {tool_name}",
        attributes={
            "code.function": "agent_tool_call",
            "agent_run_id": run_id,
            "tool.name": tool_name,
        },
    ) as span:
        try:
            yield span
        finally:
            span.set_attribute(
                "duration_ms", round((time.perf_counter() - started) * 1000, 2)
            )


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def record_agent_token_usage(
    *,
    tenant_id: str,
    agent_id: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> None:
    """Increment the per-tenant agent-token counters.

    Wired through the V4 metrics layer so Prometheus
    scrapes the value via ``/metrics``. The
    :mod:`src.observability.infrastructure.metrics`
    module exposes a single ``counter_inc`` helper
    that handles the case where Prometheus is not
    installed.
    """
    try:
        from src.observability.infrastructure.metrics import counter_inc

        counter_inc(
            "cortex_agent_tokens_total",
            amount=prompt_tokens + completion_tokens,
            labels={"tenant_id": tenant_id, "agent_id": agent_id},
        )
        counter_inc(
            "cortex_agent_iterations_total",
            labels={"tenant_id": tenant_id, "agent_id": agent_id},
        )
    except Exception:  # noqa: BLE001 - observability is best-effort
        # If the metrics layer raises (e.g. the test
        # environment does not have prometheus_client
        # wired), swallow — observability never breaks
        # a request.
        return


def record_agent_run_outcome(
    *,
    tenant_id: str,
    agent_id: str,
    outcome: str,  # one of: completed, failed, stopped, guard
) -> None:
    """Increment the per-outcome counter for agent runs."""
    try:
        from src.observability.infrastructure.metrics import counter_inc

        counter_inc(
            "cortex_agent_runs_total",
            labels={
                "tenant_id": tenant_id,
                "agent_id": agent_id,
                "outcome": outcome,
            },
        )
    except Exception:  # noqa: BLE001
        return


__all__ = [
    "agent_iteration_span",
    "agent_run_span",
    "agent_tool_call_span",
    "record_agent_run_outcome",
    "record_agent_token_usage",
]
