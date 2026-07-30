"""
Domain entities for the execution bounded context.

An :class:`AgentRun` is the *event* of an agent firing in
response to a user request. It is the runtime counterpart
to the persistent :class:`~src.agents.domain.entities.Agent`
*definition* — the agent changes slowly and is owned by the
tenant; the run changes quickly and is owned by the system.

A run carries:

* a snapshot of the agent configuration it was started
  with (so a historical run is reproducible even if the
  agent has been edited since),
* the steps it took (each step is one LLM call + the
  tool calls that followed),
* the final output, and
* the lifecycle status (started → running → completed /
  failed / stopped).

Per the project's hexagonal rule, this module has no
imports from FastAPI, SQLAlchemy, or any infrastructure
concern.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Self


class AgentRunStatus(str, Enum):  # noqa: UP042
    """Lifecycle of an :class:`AgentRun`."""

    STARTED = "started"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"

    @property
    def is_terminal(self) -> bool:
        """A terminal run is one that will not transition further."""
        return self in (
            AgentRunStatus.COMPLETED,
            AgentRunStatus.FAILED,
            AgentRunStatus.STOPPED,
        )

    @property
    def is_active(self) -> bool:
        """An active run is one the executor is still working on."""
        return self in (AgentRunStatus.STARTED, AgentRunStatus.RUNNING)


# ---------------------------------------------------------------------------
# Step — one LLM call (and any tool calls that followed within the same step)
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class AgentStep:
    """A single iteration of the agent loop.

    The ``output`` is whatever the LLM returned at the end
    of the step — text for a "finished" step, or a tool call
    for a "tool-required" step. ``tool_calls`` is the list
    of tools the LLM asked to invoke *within* this step;
    for the canonical "retrieve, then answer" flow, the
    first step has one tool call (``knowledge_search``)
    and the second has zero.

    ``error`` is populated only when the step failed (e.g.
    a tool raised). A step that completed cleanly has
    ``error=None``.
    """

    iteration: int
    output: str = ""
    tool_calls: tuple[dict[str, Any], ...] = ()
    error: str | None = None
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "iteration": self.iteration,
            "output": self.output,
            "tool_calls": list(self.tool_calls),
            "error": self.error,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Self:
        return cls(
            iteration=int(data["iteration"]),
            output=str(data.get("output", "")),
            tool_calls=tuple(data.get("tool_calls", ())),
            error=data.get("error"),
            started_at=(
                datetime.fromisoformat(data["started_at"])
                if data.get("started_at")
                else datetime.now(UTC)
            ),
            completed_at=(
                datetime.fromisoformat(data["completed_at"])
                if data.get("completed_at")
                else None
            ),
        )


# ---------------------------------------------------------------------------
# AgentRun
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class AgentRun:
    """A single execution of an :class:`~src.agents.domain.entities.Agent`."""

    id: uuid.UUID
    agent_id: uuid.UUID
    tenant_id: uuid.UUID
    # The user who triggered the run. The audit log ties
    # the run back to a specific identity, even when the
    # agent is shared across the tenant.
    user_id: uuid.UUID
    # The user-supplied goal. Stored verbatim; the
    # executor formats it into the LLM prompt.
    input: str
    # The run's final output. Populated only when the run
    # reaches the ``COMPLETED`` state.
    output: str = ""
    status: AgentRunStatus = AgentRunStatus.STARTED
    steps: tuple[AgentStep, ...] = ()
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    # Total tokens consumed by the run across all LLM
    # calls. Updated as the loop runs; surfaced in the
    # usage-event and audit-log records when the run
    # completes.
    total_tokens: int = 0

    # ----- factories --------------------------------------------------------

    @classmethod
    def start(
        cls,
        *,
        agent_id: uuid.UUID,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        input: str,
        now: datetime | None = None,
    ) -> Self:
        if not input.strip():
            raise ValueError("input is required")
        return cls(
            id=uuid.uuid4(),
            agent_id=agent_id,
            tenant_id=tenant_id,
            user_id=user_id,
            input=input,
            status=AgentRunStatus.STARTED,
            steps=(),
            started_at=now or datetime.now(UTC),
            completed_at=None,
            total_tokens=0,
        )

    @classmethod
    def from_persistence(
        cls,
        *,
        id: uuid.UUID,
        agent_id: uuid.UUID,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID,
        input: str,
        output: str,
        status: str | AgentRunStatus,
        steps: list[dict[str, Any]] | tuple[AgentStep, ...],
        started_at: datetime,
        completed_at: datetime | None,
        total_tokens: int,
    ) -> Self:
        if isinstance(status, str):
            status = AgentRunStatus(status)
        if steps and isinstance(steps[0], dict):
            steps = tuple(AgentStep.from_dict(s) for s in steps)
        return cls(
            id=id,
            agent_id=agent_id,
            tenant_id=tenant_id,
            user_id=user_id,
            input=input,
            output=output,
            status=status,
            steps=steps,
            started_at=started_at,
            completed_at=completed_at,
            total_tokens=total_tokens,
        )

    # ----- transitions -----------------------------------------------------

    def mark_running(self, *, now: datetime | None = None) -> Self:
        if self.status is not AgentRunStatus.STARTED:
            return self
        return replace(self, status=AgentRunStatus.RUNNING)

    def record_step(self, step: AgentStep) -> Self:
        return replace(self, steps=self.steps + (step,))

    def complete(
        self, *, output: str, now: datetime | None = None, total_tokens: int | None = None
    ) -> Self:
        return replace(
            self,
            status=AgentRunStatus.COMPLETED,
            output=output,
            completed_at=now or datetime.now(UTC),
            total_tokens=self.total_tokens if total_tokens is None else total_tokens,
        )

    def fail(self, *, error: str, now: datetime | None = None) -> Self:
        # The error message is appended to the run as a
        # "failed step" so the audit log has the reason
        # even if ``output`` is empty.
        failed_step = AgentStep(
            iteration=len(self.steps) + 1,
            output="",
            tool_calls=(),
            error=error,
            started_at=now or datetime.now(UTC),
            completed_at=now or datetime.now(UTC),
        )
        return replace(
            self,
            status=AgentRunStatus.FAILED,
            completed_at=now or datetime.now(UTC),
            steps=self.steps + (failed_step,),
        )

    def stop(self, *, reason: str | None = None, now: datetime | None = None) -> Self:
        if self.status.is_terminal:
            return self
        return replace(
            self,
            status=AgentRunStatus.STOPPED,
            completed_at=now or datetime.now(UTC),
            steps=(
                *self.steps,
                AgentStep(
                    iteration=len(self.steps) + 1,
                    output="",
                    tool_calls=(),
                    error=reason or "stopped by guard",
                    started_at=now or datetime.now(UTC),
                    completed_at=now or datetime.now(UTC),
                ),
            ),
        )

    def add_tokens(self, tokens: int) -> Self:
        return replace(self, total_tokens=self.total_tokens + int(tokens))


__all__ = [
    "AgentRun",
    "AgentRunStatus",
    "AgentStep",
]
