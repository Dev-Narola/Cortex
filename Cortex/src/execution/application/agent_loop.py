"""
The agent loop — the core of the agentic layer.

This is the function-form loop the spec's pseudo-code
suggests. The :class:`AgentExecutor` (in
:mod:`src.agents.application.executor`) wraps it with the
session / persistence / observability concerns; the loop
itself is pure orchestration over the LLM provider and the
tool registry.

Flow (matches the spec's pseudo-code):

    while not finished:
        response = LLM()
        if tool_required:
            execute_tool()
        else:
            finish

In real terms, each iteration:

1. Builds the message list from the run's history and any
   tool-call results from the previous step.
2. Calls the LLM with the agent's configuration
   (temperature, max_tokens, model) and the tools the
   registry has granted.
3. Inspects the LLM's response:
   * If ``finish_reason == "tool_calls"``, executes each
     tool call, appends the results to the messages,
     and continues the loop.
   * If ``finish_reason == "stop"`` (or any non-tool
     reason), returns the response text as the run's
     final output.
   * If the safeguard trips (iteration cap, time cap,
     loop detector), the run is marked ``STOPPED`` with
     a structured reason and the loop exits.

The loop is intentionally synchronous from the LLM
provider's perspective — each ``await llm.generate(...)``
is awaited before the next iteration starts. A future
V9 hardening item is per-iteration cancellation
(CancelToken-style), which would let a UI button kill a
long-running agent mid-step.
"""

from __future__ import annotations

import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol

from src.agents.domain.entities import Agent
from src.agents.domain.value_objects import AgentConfiguration
from src.agents.infrastructure.llm_provider import (
    LLMProvider,
    LLMResult,
    ToolCallRequest,
)
from src.execution.application.limits import ExecutionGuard
from src.execution.domain.entities import (
    AgentRun,
    AgentRunStatus,
    AgentStep,
)
from src.execution.infrastructure.repositories import ExecutionRepository
from src.tools.application.registry import ToolRegistry
from src.tools.domain.entities import Tool
from src.tools.domain.interfaces import BaseTool
from src.tools.infrastructure.repositories import ToolRepository


class LoopDetectorLike(Protocol):
    """The minimal protocol the loop needs from a loop detector.

    Defined here as a :class:`Protocol` so the loop does
    not have a hard import on the concrete
    :class:`~src.execution.application.limits.LoopDetector`
    class — the executor can pass any object with this
    surface, including a no-op stub in tests.
    """

    def observe(self, tool_name: str) -> None: ...
    def is_looping(self) -> bool: ...


# ---------------------------------------------------------------------------
# Tool discovery
# ---------------------------------------------------------------------------


def _resolve_tools_for_agent(
    *,
    registry: ToolRegistry,
    repo: ToolRepository,
    tenant_id: "uuid.UUID",
    agent_config: AgentConfiguration,
) -> list[dict[str, Any]]:
    """Build the OpenAI function-calling shape for the LLM.

    Only ``ACTIVE`` tools that the agent's
    ``allowed_tools`` permits are returned. A tool that
    has no live handler registered is still included —
    the executor will fail the call with a structured
    error and the LLM can decide what to do.

    ``tenant_id`` is a real ``uuid.UUID`` (not a string)
    so the tool repository's column binding works on
    both PostgreSQL and SQLite. The registry call
    stringifies internally because the in-process
    registry is keyed by string for tenant isolation.
    """
    catalog = registry.list_tools(repo=repo, tenant_id=str(tenant_id))
    out: list[dict[str, Any]] = []
    for tool in catalog:
        if not registry.agent_may_use(
            agent_allowed_tools=agent_config.allowed_tools,
            tool_name=tool.name,
        ):
            continue
        # The ``description`` and ``input_schema`` are the
        # LLM-facing surface. They are stored on the
        # persistent entity, not on the live handler, so
        # an admin can update a tool's description
        # without restarting the service.
        out.append(
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema or {
                    "type": "object",
                    "properties": {},
                },
            }
        )
    return out


# ---------------------------------------------------------------------------
# The loop
# ---------------------------------------------------------------------------


@dataclass
class AgentLoopResult:
    """The loop's final state.

    The :class:`AgentExecutor` translates this into a
    persisted :class:`AgentRun`. The fields are kept
    distinct from the domain entity so the loop can be
    tested in isolation without a database.
    """

    run: AgentRun
    finished: bool
    stop_reason: str | None = None
    total_iterations: int = 0
    total_tool_calls: int = 0


# Type alias for the executor's tool-execution callback.
ToolExecutor = Callable[[Tool, dict[str, Any]], Awaitable[Any]]


async def run_agent_loop(
    *,
    agent: Agent,
    run: AgentRun,
    llm: LLMProvider,
    registry: ToolRegistry,
    tool_repo: ToolRepository,
    guard: ExecutionGuard,
    loop_detector: LoopDetectorLike,
    on_tool_call: ToolExecutor | None = None,
) -> AgentLoopResult:
    """Execute the agent loop and return the result.

    Parameters
    ----------
    agent
        The persistent agent definition.
    run
        The freshly-started :class:`AgentRun` (status
        ``STARTED``). The loop mutates a working copy and
        returns it via :class:`AgentLoopResult`; the
        caller is responsible for persisting it.
    llm
        The provider-agnostic LLM adapter.
    registry
        The in-process tool registry (handlers + perms).
    tool_repo
        The repository for the tool catalog (used to
        build the LLM-facing tool list).
    guard
        The :class:`ExecutionGuard` enforcing hard caps.
    loop_detector
        The :class:`LoopDetector` (or a stub) tracking
        tool-call patterns.
    on_tool_call
        Optional override for tool execution. The default
        is to resolve the handler from the registry and
        call it. Tests use this hook to stub tool
        behaviour without standing up the registry.
    """
    # Build the LLM-facing tool list. The list is
    # computed once per loop because the registry is
    # in-process and the agent's allowed_tools don't
    # change mid-run.
    llm_tools = _resolve_tools_for_agent(
        registry=registry,
        repo=tool_repo,
        tenant_id=agent.tenant_id,
        agent_config=agent.configuration,
    )

    # Conversation history starts with the user input.
    # The LLM gets the agent's system_prompt via the
    # ``system`` parameter (not as a message), matching
    # the OpenAI convention.
    messages: list[dict[str, Any]] = [
        {"role": "user", "content": run.input},
    ]

    working_run = run.mark_running()
    total_iterations = 0
    total_tool_calls = 0

    while True:
        # --- safeguard: iteration cap ---------------------------
        guard.check_iteration(total_iterations + 1)
        # --- safeguard: time cap -------------------------------
        guard.check_elapsed()

        total_iterations += 1
        step_started = datetime.now(UTC)

        llm_result: LLMResult = await llm.generate(
            model=agent.model,
            system=agent.system_prompt,
            messages=messages,
            tools=llm_tools or None,
            temperature=agent.configuration.temperature,
            max_tokens=agent.configuration.max_tokens,
        )

        # Add the LLM's reply to the conversation history.
        # The exact shape depends on whether tools were
        # called. The simple case (no tools) is just an
        # assistant message.
        if llm_result.tool_calls:
            messages.append(
                {
                    "role": "assistant",
                    "content": llm_result.output or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": json.dumps(tc.arguments),
                            },
                        }
                        for tc in llm_result.tool_calls
                    ],
                }
            )
        elif llm_result.output:
            messages.append(
                {"role": "assistant", "content": llm_result.output}
            )

        # --- branch: stop on final answer -----------------------
        if llm_result.finish_reason != "tool_calls" or not llm_result.tool_calls:
            step = AgentStep(
                iteration=total_iterations,
                output=llm_result.output,
                tool_calls=(),
                error=None,
                started_at=step_started,
                completed_at=datetime.now(UTC),
            )
            working_run = working_run.record_step(step)
            working_run = working_run.add_tokens(
                llm_result.prompt_tokens + llm_result.completion_tokens
            )
            return AgentLoopResult(
                run=working_run.complete(
                    output=llm_result.output,
                    total_tokens=working_run.total_tokens,
                ),
                finished=True,
                stop_reason=llm_result.finish_reason,
                total_iterations=total_iterations,
                total_tool_calls=total_tool_calls,
            )

        # --- branch: execute tool calls ------------------------
        step_tool_calls: list[dict[str, Any]] = []
        for tc in llm_result.tool_calls:
            guard.check_tool_calls(total_tool_calls + 1)
            total_tool_calls += 1

            tool_entity = tool_repo.get_by_name(
                tenant_id=agent.tenant_id, name=tc.name
            )
            if tool_entity is None:
                # The LLM asked for a tool the tenant has
                # not registered. Surface a structured
                # error so the LLM can correct itself.
                tool_result = {
                    "error": f"tool '{tc.name}' is not registered for this tenant"
                }
            else:
                try:
                    if on_tool_call is not None:
                        tool_result = await on_tool_call(tool_entity, tc.arguments)
                    else:
                        handler = registry.get_handler(
                            name=tc.name, tenant_id=str(agent.tenant_id)
                        )
                        tool_result = await handler.execute(**tc.arguments)
                except Exception as exc:  # noqa: BLE001 - tool errors are recoverable, not fatal
                    tool_result = {
                        "error": f"{type(exc).__name__}: {exc}",
                    }

            loop_detector.observe(tc.name)

            step_tool_calls.append(
                {
                    "id": tc.id,
                    "name": tc.name,
                    "arguments": tc.arguments,
                    "result": tool_result,
                }
            )
            # Add the tool result to the message stream so
            # the next LLM call can see it.
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": (
                        tool_result
                        if isinstance(tool_result, str)
                        else json.dumps(tool_result, default=str)
                    ),
                }
            )

        step = AgentStep(
            iteration=total_iterations,
            output=llm_result.output,
            tool_calls=tuple(step_tool_calls),
            error=None,
            started_at=step_started,
            completed_at=datetime.now(UTC),
        )
        working_run = working_run.record_step(step)
        working_run = working_run.add_tokens(
            llm_result.prompt_tokens + llm_result.completion_tokens
        )

        # --- safeguard: loop detector --------------------------
        if loop_detector.is_looping():
            working_run = working_run.stop(reason="loop detected")
            return AgentLoopResult(
                run=working_run,
                finished=False,
                stop_reason="loop_detected",
                total_iterations=total_iterations,
                total_tool_calls=total_tool_calls,
            )


__all__ = [
    "AgentLoopResult",
    "LoopDetectorLike",
    "ToolExecutor",
    "run_agent_loop",
]
