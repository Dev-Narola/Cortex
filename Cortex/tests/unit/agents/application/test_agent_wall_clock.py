"""Agent runs are bounded in wall-clock time even when one LLM call hangs (US-7)."""

from __future__ import annotations

import asyncio
import time

from src.agents.application import executor as executor_mod
from src.agents.application.executor import AgentExecutor
from src.agents.domain.entities import Agent
from src.agents.infrastructure.repositories import AgentRepository
from src.tools.application.registry import ToolRegistry


class _HangingLLM:
    default_model = "m"

    async def generate(self, **_kwargs):
        await asyncio.sleep(30)


def test_hanging_llm_call_is_stopped_at_the_budget(db_session, tenant_id, user_id, monkeypatch):
    monkeypatch.setattr(executor_mod, "_RUN_TIME_BUDGET_SECONDS", 0.3)
    agent = AgentRepository(db_session).create(
        Agent.create(tenant_id=tenant_id, name="slow", system_prompt="s", model="m")
    )
    db_session.commit()
    executor = AgentExecutor(db_session, llm=_HangingLLM(), registry=ToolRegistry())

    started = time.monotonic()
    result = asyncio.run(
        executor.execute_async(
            tenant_id=tenant_id, agent_id=agent.id, user_id=user_id, message="hi"
        )
    )
    assert time.monotonic() - started < 5
    assert result.finished is False
    assert "max_execution_time_seconds" in (result.stop_reason or "") or "wall-clock" in (
        result.stop_reason or ""
    )
