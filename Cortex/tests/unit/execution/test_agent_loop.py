"""
Tests for the :func:`run_agent_loop` function.

The loop is the most complex piece of V6 logic. These
tests stub the LLM provider and the tool registry, then
drive the loop through its three terminal states:

* "final answer" — the LLM returns ``finish_reason="stop"``
  on the first call; the loop records the step and
  returns the output.
* "tool then answer" — the LLM returns a tool call on
  the first call, then ``finish_reason="stop"`` on the
  second. The loop executes the tool, appends the
  result, and calls the LLM again.
* "loop detected" — the agent calls the same two tools
  in a repeating pattern; the loop detector trips and
  the run is marked ``STOPPED``.
* "guard tripped" — the iteration cap is exceeded; the
  loop raises :class:`ExecutionGuardTripped`.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest

from src.agents.domain.entities import Agent
from src.agents.domain.value_objects import AgentConfiguration
from src.agents.infrastructure.llm_provider import (
    LLMProvider,
    LLMResult,
    ToolCallRequest,
)
from src.execution.application.agent_loop import run_agent_loop
from src.execution.application.limits import (
    ExecutionGuard,
    ExecutionLimits,
    LoopDetector,
)
from src.execution.domain.entities import AgentRun, AgentRunStatus
from src.execution.infrastructure.repositories import ExecutionRepository
from src.tools.application.registry import ToolRegistry
from src.tools.domain.entities import Tool
from src.tools.infrastructure.repositories import ToolRepository


# ---------------------------------------------------------------------------
# Test doubles
# ---------------------------------------------------------------------------


class _StubTool:
    """Minimal :class:`BaseTool` double for loop tests."""

    def __init__(self, name: str, result: Any = "ok") -> None:
        self._name = name
        self.result = result
        self.calls: list[dict[str, Any]] = []

    @property
    def name(self) -> str:
        return self._name

    def describe(self) -> dict[str, Any]:
        return {
            "name": self._name,
            "description": "stub",
            "parameters": {"type": "object", "properties": {}},
        }

    async def execute(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return self.result


class _ScriptedLLM(LLMProvider):
    """An LLM provider that returns a scripted sequence of results.

    Each call to :meth:`generate` pops the next result
    off the queue. When the queue is empty, returns
    ``finish_reason="stop"`` with an empty string so the
    loop terminates gracefully.
    """

    def __init__(self, results: list[LLMResult]) -> None:
        self._queue = list(results)
        self.calls = 0

    async def generate(
        self, *, model, system, messages, tools=None, temperature=0.2, max_tokens=1024
    ) -> LLMResult:
        self.calls += 1
        if self._queue:
            return self._queue.pop(0)
        return LLMResult(output="<end>", finish_reason="stop")

    def stream(self, **kwargs):
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def agent(tenant_id):
    return Agent.create(
        tenant_id=tenant_id,
        name="A1",
        system_prompt="You are helpful.",
        model="gpt-4o-mini",
        configuration=AgentConfiguration(max_iterations=10),
    )


@pytest.fixture
def run(agent, user_id):
    return AgentRun.start(
        agent_id=agent.id,
        tenant_id=agent.tenant_id,
        user_id=user_id,
        input="hi",
    )


@pytest.fixture
def registry():
    return ToolRegistry()


@pytest.fixture
def guard():
    return ExecutionGuard(ExecutionLimits(max_iterations=5, max_execution_time_seconds=10, max_tool_calls=10))


@pytest.fixture
def loop_detector():
    return LoopDetector(window_size=6, threshold=3, min_pattern_length=2)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_final_answer_on_first_call(
    db_session, agent, run, registry, guard, loop_detector
):
    llm = _ScriptedLLM(
        [LLMResult(output="the answer is 42", finish_reason="stop")]
    )
    repo = ToolRepository(db_session)
    exec_repo = ExecutionRepository(db_session)
    result = await run_agent_loop(
        agent=agent,
        run=run,
        llm=llm,
        registry=registry,
        tool_repo=repo,
        guard=guard,
        loop_detector=loop_detector,
    )
    # Persist the run so the assertions run against the
    # ``from_persistence`` mapping as well as the
    # in-memory one.
    exec_repo.create_run(result.run)
    db_session.commit()
    assert result.finished is True
    assert result.run.status is AgentRunStatus.COMPLETED
    assert result.run.output == "the answer is 42"
    assert len(result.run.steps) == 1


@pytest.mark.asyncio
async def test_tool_then_answer(
    db_session, agent, run, registry, guard, loop_detector
):
    tool = _StubTool("search")
    registry.register(tool)
    # Seed a tool in the catalog so the LLM-facing tool
    # list is non-empty.
    tool_entity = Tool.create(
        tenant_id=agent.tenant_id,
        name="search",
        description="x",
        input_schema={"type": "object", "properties": {}},
        handler="stub",
    )
    ToolRepository(db_session).create(tool_entity)
    db_session.commit()

    llm = _ScriptedLLM(
        [
            LLMResult(
                output="",
                finish_reason="tool_calls",
                tool_calls=(
                    ToolCallRequest(id="t1", name="search", arguments={}),
                ),
            ),
            LLMResult(output="the answer is 42", finish_reason="stop"),
        ]
    )
    result = await run_agent_loop(
        agent=agent,
        run=run,
        llm=llm,
        registry=registry,
        tool_repo=ToolRepository(db_session),
        guard=guard,
        loop_detector=loop_detector,
    )
    assert result.finished is True
    assert result.run.output == "the answer is 42"
    assert len(result.run.steps) == 2
    # The first step has a tool call, the second doesn't.
    assert len(result.run.steps[0].tool_calls) == 1
    assert len(result.run.steps[1].tool_calls) == 0


@pytest.mark.asyncio
async def test_loop_detector_stops_run(
    db_session, agent, run, registry, loop_detector
):
    # Use a high iteration cap so the loop detector
    # has room to fire before the guard does.
    guard = ExecutionGuard(
        ExecutionLimits(
            max_iterations=20, max_execution_time_seconds=10, max_tool_calls=20
        )
    )
    # Two-tool ping-pong (search, summarise, search,
    # summarise, ...). The detector's threshold=3 and
    # pattern-length=2 means the pattern must repeat
    # 3 times in the sliding window — 6 tool calls is
    # enough to trip.
    ToolRepository(db_session).create(
        Tool.create(
            tenant_id=agent.tenant_id,
            name="search",
            description="x",
            input_schema={"type": "object", "properties": {}},
            handler="stub",
        )
    )
    ToolRepository(db_session).create(
        Tool.create(
            tenant_id=agent.tenant_id,
            name="summarise",
            description="x",
            input_schema={"type": "object", "properties": {}},
            handler="stub",
        )
    )
    db_session.commit()
    registry.register(_StubTool("search"))
    registry.register(_StubTool("summarise"))

    # 7 alternating calls; the detector should trip
    # on the 6th.
    ping_pong = ["search", "summarise"] * 4
    calls = []
    for name in ping_pong:
        calls.append(
            LLMResult(
                output="",
                finish_reason="tool_calls",
                tool_calls=(
                    ToolCallRequest(id=str(uuid.uuid4()), name=name, arguments={}),
                ),
            )
        )
    calls.append(LLMResult(output="done", finish_reason="stop"))
    llm = _ScriptedLLM(calls)

    result = await run_agent_loop(
        agent=agent,
        run=run,
        llm=llm,
        registry=registry,
        tool_repo=ToolRepository(db_session),
        guard=guard,
        loop_detector=loop_detector,
    )
    assert result.finished is False
    assert result.run.status is AgentRunStatus.STOPPED
    assert result.stop_reason == "loop_detected"


@pytest.mark.asyncio
async def test_guard_trips_on_iteration_cap(
    db_session, agent, run, registry, loop_detector
):
    from src.execution.application.limits import ExecutionGuardTripped

    # A guard with a 2-iteration cap.
    small_guard = ExecutionGuard(
        ExecutionLimits(
            max_iterations=2, max_execution_time_seconds=10, max_tool_calls=10
        )
    )
    tool = _StubTool("ping")
    registry.register(tool)
    ToolRepository(db_session).create(
        Tool.create(
            tenant_id=agent.tenant_id,
            name="ping",
            description="x",
            input_schema={"type": "object", "properties": {}},
            handler="stub",
        )
    )
    db_session.commit()

    # The LLM always asks for a tool; the guard trips
    # on the 3rd iteration.
    calls = [
        LLMResult(
            output="",
            finish_reason="tool_calls",
            tool_calls=(
                ToolCallRequest(id="t", name="ping", arguments={}),
            ),
        )
        for _ in range(10)
    ]
    llm = _ScriptedLLM(calls)
    with pytest.raises(ExecutionGuardTripped):
        await run_agent_loop(
            agent=agent,
            run=run,
            llm=llm,
            registry=registry,
            tool_repo=ToolRepository(db_session),
            guard=small_guard,
            loop_detector=loop_detector,
        )
