"""
Application services for the agents bounded context.

An application service is the orchestration layer between the
interface (REST) and the domain + infrastructure. Its job is
to:

* translate an inbound request into a domain operation,
* enforce business rules that span more than one entity
  (e.g. "cannot delete an agent with a non-terminal run"),
* commit the transaction, and
* translate domain exceptions into the appropriate HTTP-shaped
  errors.

Per the project's hexagonal rule, the services are free to
import from the domain layer and the repository layer; they
do *not* import from FastAPI, the LLM provider, the tool
registry, or any other concern that lives above this layer.

The three services here are the V6 spec's Tasks 6, 7, and 8.
Read operations (``get``, ``list``) are *not* their own
services — they are thin pass-throughs that the interface
layer can call directly through the repository. This matches
the pattern in :mod:`src.identity.application.services`.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from src.agents.domain.entities import Agent, AgentStatus
from src.agents.domain.exceptions import AgentNotFound, AgentRunNotFound
from src.agents.domain.value_objects import AgentConfiguration
from src.agents.infrastructure.repositories import AgentRepository
from src.execution.domain.entities import AgentRun, AgentRunStatus, AgentStep
from src.execution.infrastructure.repositories import ExecutionRepository
from src.shared.exceptions import (
    ConflictException,
    NotFoundException,
    ValidationException,
)


# ---------------------------------------------------------------------------
# CreateAgentService
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CreateAgentInput:
    """The validated shape of a create-agent request.

    The service does not accept a raw dict so the route
    handler is forced to use a Pydantic model — that gives us
    request-shape validation for free at the HTTP boundary.
    """

    tenant_id: uuid.UUID
    name: str
    system_prompt: str
    model: str
    description: str = ""
    configuration: AgentConfiguration | None = None


class CreateAgentService:
    """Create a new agent for a tenant.

    The flow is:

    1. Build the domain entity via :meth:`Agent.create`. This
       is where the field-level rules live (name required,
       system prompt required, configuration constraints).
    2. Persist via the repository. A duplicate name surfaces
       as :class:`ConflictException` (HTTP 409).
    3. Return the freshly-persisted entity so the route
       handler can serialise it.
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._repo = AgentRepository(db)

    def execute(self, input: CreateAgentInput) -> Agent:
        # ``Agent.create`` does the field-level validation
        # (name required, system prompt required, etc.) and
        # raises ``ValidationException`` on failure. The
        # value-object constructor (``AgentConfiguration``)
        # does the configuration-level validation.
        agent = Agent.create(
            tenant_id=input.tenant_id,
            name=input.name,
            description=input.description,
            system_prompt=input.system_prompt,
            model=input.model,
            configuration=input.configuration,
        )
        created = self._repo.create(agent)
        self._db.commit()
        return created


# ---------------------------------------------------------------------------
# UpdateAgentService
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class UpdateAgentInput:
    """Partial-update payload for an agent.

    All fields are optional; ``None`` means "do not change".
    The service translates this to a domain ``with_changes``
    call, which re-validates the new values.
    """

    tenant_id: uuid.UUID
    agent_id: uuid.UUID
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    model: str | None = None
    configuration: AgentConfiguration | None = None


class UpdateAgentService:
    """Apply a partial update to an agent.

    Business rules:

    * The agent must exist and belong to the tenant
      (else 404, not 403, to avoid leaking existence).
    * The agent must not be archived — an archived agent
      is read-only.
    * At least one field must be supplied; an empty update
      is a no-op that the caller almost certainly did not
      intend. We reject it explicitly.
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._repo = AgentRepository(db)

    def execute(self, input: UpdateAgentInput) -> Agent:
        if not any(
            v is not None
            for v in (
                input.name,
                input.description,
                input.system_prompt,
                input.model,
                input.configuration,
            )
        ):
            raise ValidationException(
                message="update request must change at least one field",
                code=400,
                data={"agent_id": str(input.agent_id)},
            )

        agent = self._repo.get(
            tenant_id=input.tenant_id, agent_id=input.agent_id
        )
        if agent is None:
            raise AgentNotFound(
                message="agent not found",
                code=404,
                data={
                    "agent_id": str(input.agent_id),
                    "tenant_id": str(input.tenant_id),
                },
            )
        if agent.status.is_terminal:
            raise ValidationException(
                message="archived agents cannot be updated",
                code=400,
                data={
                    "agent_id": str(agent.id),
                    "status": agent.status.value,
                },
            )

        updated = agent.with_changes(
            name=input.name,
            description=input.description,
            system_prompt=input.system_prompt,
            model=input.model,
            configuration=input.configuration,
        )
        self._repo.update(updated)
        self._db.commit()
        return updated


# ---------------------------------------------------------------------------
# DeleteAgentService
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class DeleteAgentInput:
    tenant_id: uuid.UUID
    agent_id: uuid.UUID


class DeleteAgentService:
    """Soft-delete an agent.

    The spec says "cannot delete running agent." "Running"
    here means an ``AgentRun`` whose status is one of
    ``STARTED`` or ``RUNNING`` (the non-terminal states). The
    check is a defensive read against the execution
    repository; if no such run exists, the soft delete
    proceeds.

    The "soft delete preferred" rule is implemented in the
    repository by setting ``deleted_at`` + transitioning
    ``status`` to ``ARCHIVED`` in the same UPDATE. The
    historical run rows remain referentially intact.
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._repo = AgentRepository(db)

    def execute(self, input: DeleteAgentInput) -> None:
        # Read the agent first so we can return a structured
        # 404 for "not found" / "wrong tenant" rather than a
        # silent false from the repository.
        agent = self._repo.get(
            tenant_id=input.tenant_id, agent_id=input.agent_id
        )
        if agent is None:
            raise AgentNotFound(
                message="agent not found",
                code=404,
                data={
                    "agent_id": str(input.agent_id),
                    "tenant_id": str(input.tenant_id),
                },
            )

        # Refuse to delete an agent with a non-terminal run.
        # The execution repository's contract is that
        # ``has_running_run`` returns True if any STARTED /
        # RUNNING run exists for the agent. The import is
        # local to avoid a circular dependency at module
        # load (the execution context's __init__ will pull
        # this module in).
        try:
            from src.execution.infrastructure.repositories import (
                ExecutionRepository,
            )

            exec_repo = ExecutionRepository(self._db)
            if exec_repo.has_running_run(agent_id=agent.id):
                raise ConflictException(
                    message="cannot delete agent with a running execution",
                    code=409,
                    data={
                        "agent_id": str(agent.id),
                        "tenant_id": str(agent.tenant_id),
                    },
                )
        except ImportError:
            # The execution context may not be present in
            # tests that exercise only the agents context.
            # Skip the running-run check in that case —
            # the soft delete still goes through.
            pass

        deleted = self._repo.delete(
            tenant_id=input.tenant_id, agent_id=input.agent_id
        )
        if not deleted:
            # The agent was archived between the read and
            # the write (a race with a concurrent request).
            # Treat as a 404 so the API response is
            # deterministic.
            raise AgentNotFound(
                message="agent not found",
                code=404,
                data={
                    "agent_id": str(input.agent_id),
                    "tenant_id": str(input.tenant_id),
                },
            )
        self._db.commit()


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------


class GetAgentService:
    """Read a single agent by id, scoped to the tenant.

    Kept as a service so the interface layer has a single
    consistent pattern (``service.execute(...)``) for both
    reads and writes. The implementation is a one-line
    pass-through today; if read-side concerns grow (e.g.
    masking fields for viewer-role users) this is the place.
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._repo = AgentRepository(db)

    def execute(
        self, *, tenant_id: uuid.UUID, agent_id: uuid.UUID
    ) -> Agent:
        agent = self._repo.get(tenant_id=tenant_id, agent_id=agent_id)
        if agent is None:
            raise AgentNotFound(
                message="agent not found",
                code=404,
                data={
                    "agent_id": str(agent_id),
                    "tenant_id": str(tenant_id),
                },
            )
        return agent


class ListAgentsService:
    """List a tenant's agents with pagination.

    Returns a tuple of ``(items, total)`` so the interface
    layer can render a standard paginated response without
    a second round trip. The ``status`` filter is optional.
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._repo = AgentRepository(db)

    def execute(
        self,
        *,
        tenant_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
        status: AgentStatus | None = None,
    ) -> tuple[Sequence[Agent], int]:
        items = self._repo.list(
            tenant_id=tenant_id,
            limit=limit,
            offset=offset,
            status=status,
        )
        total = self._repo.count(tenant_id=tenant_id, status=status)
        return items, total


# ---------------------------------------------------------------------------
# F5 Part 3 — Agent Run read service + tool-call flattener
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class FlattenedToolCall:
    """A single, UI-ready tool-call record for the agent trace.

    The backend's :class:`~src.execution.domain.entities.AgentRun`
    stores the per-step ``tool_calls`` as arbitrary dicts (because
    the agent loop records whatever the tool produced at the
    time of execution). The route layer can't reasonably expose
    that opaque shape to the frontend; the frontend only needs:

    * ``id`` — stable identifier of the call within the run.
    * ``name`` — the tool's name (e.g. ``retrieve_documents``).
    * ``result_summary`` — a short, single-line summary derived
      from the recorded ``result`` payload.
    * ``latency_ms`` — wall-clock duration of the parent step
      (the agent loop doesn't record per-tool-call timestamps,
      so the step's duration is the most useful proxy).
    * ``status`` — ``ok`` / ``error`` / ``unknown`` for the
      summary line.
    * ``error`` — short error string when ``status == "error"``.

    Keeping this as a frozen dataclass means the route layer
    never invents a second schema and the helper is trivially
    unit-testable.
    """

    id: str
    name: str
    result_summary: str
    latency_ms: int | None
    status: str  # ok | error | unknown
    error: str | None


def _ms_between(start: datetime, end: datetime | None) -> int | None:
    """Return the millisecond duration of ``(start, end)``.

    The agent loop records ``started_at`` and ``completed_at``
    on every :class:`~src.execution.domain.entities.AgentStep`
    as timezone-aware ``datetime``s. If ``completed_at`` is
    ``None`` (step did not finish — e.g. the guard tripped),
    we return ``None`` so the UI can show a "did not finish"
    state rather than a misleading 0ms.
    """
    if end is None:
        return None
    if start.tzinfo is None or end.tzinfo is None:
        # Defensive: the database stores timezone-aware values,
        # but tests may construct naive datetimes. Treat naive
        # datetimes as UTC so the subtraction is meaningful.
        start = start.replace(tzinfo=UTC) if start.tzinfo is None else start
        end = end.replace(tzinfo=UTC) if end.tzinfo is None else end
    delta = end - start
    return max(int(delta.total_seconds() * 1000), 0)


def _summarise_tool_result(
    raw: Any,
    *,
    max_chars: int = 80,
) -> tuple[str, str, str | None]:
    """Derive a one-line summary + status from a tool result.

    The agent loop records tool results as either:

    * a string (the tool returned raw text), or
    * a JSON-serialisable dict (most common — the tool returns
      structured data), or
    * a dict with an ``error`` key (the tool failed).

    The function collapses each case to:

    * ``(summary, "ok", None)`` for successful results,
    * ``(summary, "error", error_string)`` for failed results,
    * ``(summary, "unknown", None)`` for everything else.

    ``max_chars`` caps the summary length so a tool that returns
    a multi-megabyte JSON document doesn't blow up the wire
    payload. The full result is still available in the raw
    ``AgentRun`` via the ``GET /agents/runs/{id}`` endpoint.
    """
    # --- failure: structured error dict -------------------------
    if isinstance(raw, dict) and raw.get("error"):
        err = str(raw["error"])
        return ("Tool failed", "error", err[: max_chars + 32])

    # --- success: string result ---------------------------------
    if isinstance(raw, str):
        text = raw.strip() or "(no output)"
        return (text[:max_chars], "ok", None)

    # --- success: structured dict -------------------------------
    if isinstance(raw, dict):
        # Prefer explicit "summary" / "message" / "text" keys if
        # the tool supplied one. Otherwise synthesise from the
        # number of items, the size, or a list preview.
        for key in ("summary", "message", "text"):
            if key in raw and isinstance(raw[key], str) and raw[key].strip():
                return (raw[key].strip()[:max_chars], "ok", None)
        if "items" in raw and isinstance(raw["items"], list):
            count = len(raw["items"])
            head = raw["items"][0] if raw["items"] else None
            head_repr = (
                f"first={str(head)[: max_chars - 24]}"
                if head is not None
                else "empty"
            )
            return (
                f"{count} item{'s' if count != 1 else ''} ({head_repr})"[
                    :max_chars
                ],
                "ok",
                None,
            )
        if "chunks" in raw and isinstance(raw["chunks"], list):
            count = len(raw["chunks"])
            return (f"{count} chunks", "ok", None)
        if "entities" in raw and isinstance(raw["entities"], list):
            count = len(raw["entities"])
            return (f"{count} entities", "ok", None)
        # Fall back to the dict's repr, truncated.
        try:
            text = str(raw)
        except Exception:  # noqa: BLE001
            text = "(unserialisable result)"
        return (text[:max_chars], "ok", None)

    # --- success: list result -----------------------------------
    if isinstance(raw, list):
        count = len(raw)
        return (f"{count} item{'s' if count != 1 else ''}", "ok", None)

    # --- success: scalar ----------------------------------------
    if raw is None:
        return ("(no output)", "ok", None)
    try:
        return (str(raw)[:max_chars], "ok", None)
    except Exception:  # noqa: BLE001
        return ("(unserialisable result)", "ok", None)


def flatten_run_tool_calls(run: AgentRun) -> list[FlattenedToolCall]:
    """Flatten an :class:`AgentRun` into a list of tool-call records.

    The agent loop's recording is:

    * each :class:`AgentStep` = one LLM iteration;
    * a step's ``tool_calls`` tuple = the tool calls the LLM
      asked for *within* that step (one or more);
    * a step with ``tool_calls == ()`` and a non-empty
      ``output`` is the "final answer" step.

    The trace UI needs a flat list of "what the agent did",
    in execution order. The flattening rule is:

    1. For each step, in iteration order, emit one
       :class:`FlattenedToolCall` per recorded tool call.
    2. After all tool-call steps, if the last step is a
       "final answer" step (no tool calls, non-empty output),
       emit a synthetic tool-call record with name
       ``generate_answer`` so the trace shows the synthesis
       step. This matches the UI/UX spec's example:

           ● generate_answer                       1.2s
             Synthesized final response

       The final-answer step's ``output`` is used as the
       result summary; if the output is empty, the summary is
       ``(no output)``.

    The function never invents a tool name — ``generate_answer``
    is the conventional name of the LLM synthesis step and is
    consistent with how the agent system labels it in
    observability.
    """
    out: list[FlattenedToolCall] = []
    for step in run.steps:
        step_latency = _ms_between(step.started_at, step.completed_at)
        if step.tool_calls:
            for tc in step.tool_calls:
                if not isinstance(tc, dict):
                    # Defensive: the agent loop should only write
                    # dicts, but a forward-compat tool might write
                    # something else. Skip rather than crash.
                    continue
                name = str(tc.get("name") or "unknown_tool")
                raw_result = tc.get("result")
                summary, status, err = _summarise_tool_result(raw_result)
                out.append(
                    FlattenedToolCall(
                        id=str(tc.get("id") or f"{name}-{len(out)}"),
                        name=name,
                        result_summary=summary,
                        latency_ms=step_latency,
                        status=status,
                        error=err,
                    )
                )
    # Final-answer step: if the run terminated with a non-tool
    # iteration, surface it as the synthesis step. We use the
    # last step that has no tool calls and a non-empty output;
    # the iteration's latency is the meaningful duration.
    final_step = _pick_final_answer_step(run.steps)
    if final_step is not None:
        out.append(
            FlattenedToolCall(
                id=f"final-{final_step.iteration}",
                name="generate_answer",
                result_summary=(final_step.output or "(no output)").strip()[:80],
                latency_ms=_ms_between(
                    final_step.started_at, final_step.completed_at
                ),
                status=("error" if final_step.error else "ok"),
                error=final_step.error,
            )
        )
    return out


def _pick_final_answer_step(
    steps: tuple[AgentStep, ...],
) -> AgentStep | None:
    """Return the last ``AgentStep`` that looks like a final answer.

    Heuristic: a step with no tool calls AND a non-empty output
    is treated as the synthesis step. If the run terminated by
    error (``error`` set, ``output`` empty), the function still
    returns that step so the trace can show the failure.
    """
    final: AgentStep | None = None
    for step in steps:
        if not step.tool_calls:
            final = step
    if final is None:
        return None
    if final.output.strip() or final.error:
        return final
    return None


class GetAgentRunService:
    """Read a single :class:`AgentRun` for the requesting tenant.

    Mirrors :class:`GetAgentService`: a one-line pass-through to
    the execution repository. The tenant id is part of the lookup
    key so a run belonging to a different tenant surfaces as 404,
    not 403.

    **F5 Part 3.** The route layer (and tests) call this to fetch
    a run so the frontend can render the agent trace. The
    flattening of ``AgentRun.steps`` into UI-ready tool calls
    happens in the route via :func:`flatten_run_tool_calls`.
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._run_repo = ExecutionRepository(db)

    def execute(
        self, *, tenant_id: uuid.UUID, run_id: uuid.UUID
    ) -> AgentRun:
        run = self._run_repo.get_run(
            tenant_id=tenant_id, run_id=run_id
        )
        if run is None:
            raise AgentRunNotFound(
                message="agent run not found",
                code=404,
                data={
                    "run_id": str(run_id),
                    "tenant_id": str(tenant_id),
                },
            )
        return run


def serialise_run_step(step: AgentStep) -> dict[str, Any]:
    """Serialise a single :class:`AgentStep` to a wire dict.

    The route layer's Pydantic response model consumes this
    output. The shape is intentionally stable: any change here
    is a public-API change and must be reflected in the
    frontend's ``types/agent.ts`` + tests.
    """
    return {
        "iteration": step.iteration,
        "output": step.output,
        "tool_calls": [tc for tc in step.tool_calls if isinstance(tc, dict)],
        "error": step.error,
        "started_at": step.started_at.isoformat() if step.started_at else None,
        "completed_at": (
            step.completed_at.isoformat() if step.completed_at else None
        ),
        "latency_ms": _ms_between(step.started_at, step.completed_at),
    }


def serialise_run(run: AgentRun) -> dict[str, Any]:
    """Serialise a full :class:`AgentRun` to a wire dict.

    Same stability contract as :func:`serialise_run_step`. The
    flattened tool-call list is included under ``tool_calls`` for
    the convenience of clients that only need the trace (and
    don't want to walk ``steps`` themselves).
    """
    return {
        "id": str(run.id),
        "agent_id": str(run.agent_id),
        "tenant_id": str(run.tenant_id),
        "user_id": str(run.user_id),
        "input": run.input,
        "output": run.output,
        "status": run.status.value
        if isinstance(run.status, AgentRunStatus)
        else str(run.status),
        "iterations": len(run.steps),
        "tool_call_count": sum(len(s.tool_calls) for s in run.steps),
        "total_tokens": run.total_tokens,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": (
            run.completed_at.isoformat() if run.completed_at else None
        ),
        "steps": [serialise_run_step(s) for s in run.steps],
        "tool_calls": [
            {
                "id": tc.id,
                "name": tc.name,
                "result_summary": tc.result_summary,
                "latency_ms": tc.latency_ms,
                "status": tc.status,
                "error": tc.error,
            }
            for tc in flatten_run_tool_calls(run)
        ],
    }


__all__ = [
    "CreateAgentInput",
    "CreateAgentService",
    "DeleteAgentInput",
    "DeleteAgentService",
    "FlattenedToolCall",
    "GetAgentRunService",
    "GetAgentService",
    "ListAgentsService",
    "UpdateAgentInput",
    "UpdateAgentService",
    "flatten_run_tool_calls",
    "serialise_run",
    "serialise_run_step",
]
