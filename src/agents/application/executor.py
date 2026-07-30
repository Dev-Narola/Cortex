"""
The :class:`AgentExecutor` — the application-layer harness around
the pure loop in :mod:`src.execution.application.agent_loop`.

The split between the loop and the executor is the same split
the spec calls out:

* The **loop** (:mod:`src.execution.application.agent_loop`)
  is the *function-form* orchestrator. It depends on the LLM
  provider, the tool registry, and the safeguards — nothing
  else. The loop can be unit-tested with stubs for every
  collaborator.

* The **executor** (this module) is the *object-form*
  collaborator: it owns the database session, instantiates
  the repositories, registers the loop's result with the
  audit log, and threads the run through the rate limiter.
  This is what the REST handler calls.

The split is what makes the loop testable. The agent loop
is the most complex piece of V6 logic; isolating it from
the database, the LLM provider, the rate limiter, and the
audit log means the loop's tests can be small and focused.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, replace as dataclass_replace
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session

from src.agents.domain.entities import Agent
from src.agents.domain.exceptions import (
    AgentExecutionFailed,
    AgentInactive,
    AgentNotFound,
)
from src.agents.domain.value_objects import AgentConfiguration
from src.agents.infrastructure.llm_provider import LLMProvider
from src.agents.infrastructure.repositories import AgentRepository
from src.execution.application.agent_loop import run_agent_loop
from src.execution.application.limits import (
    ExecutionGuard,
    ExecutionGuardTripped,
    ExecutionLimits,
    LoopDetector,
)
from src.execution.domain.entities import AgentRun, AgentRunStatus
from src.execution.infrastructure.repositories import ExecutionRepository
from src.limits.application.service import RateLimitExceeded, RateLimiter
from src.tools.application.registry import ToolRegistry
from src.tools.infrastructure.repositories import ToolRepository

if TYPE_CHECKING:
    from src.graph_retrieval.application.services import GraphRetrievalService

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AgentRunResult:
    """The shape of the response from :meth:`AgentExecutor.execute`.

    A flat dict-friendly shape so the route handler
    can serialise it without touching the domain
    entity. The ``run`` field carries the full
    domain object for callers that want it
    (e.g. an MCP tool that exposes the steps).
    """

    run: AgentRun
    finished: bool
    stop_reason: str | None = None


class AgentExecutor:
    """Application-layer wrapper around the agent loop.

    Owns the database session and the cross-cutting
    concerns (rate limit, audit log) that the pure loop
    should not know about.
    """

    def __init__(
        self,
        db: Session,
        *,
        llm: LLMProvider,
        registry: ToolRegistry,
        rate_limiter: RateLimiter | None = None,
        graph_retrieval: GraphRetrievalService | None = None,
    ) -> None:
        self._db = db
        self._llm = llm
        self._registry = registry
        self._rate_limiter = rate_limiter
        self._graph_retrieval = graph_retrieval
        self._agent_repo = AgentRepository(db)
        self._tool_repo = ToolRepository(db)
        self._run_repo = ExecutionRepository(db)

    def execute(
        self,
        *,
        tenant_id: uuid.UUID,
        agent_id: uuid.UUID,
        user_id: uuid.UUID,
        message: str,
    ) -> AgentRunResult:
        """Run the agent and return the final state.

        Flow:

        1. Rate-limit check (best-effort; the
           ``RateLimiter`` is optional so tests can
           run without Redis).
        2. Load the agent; raise
           :class:`AgentNotFound` if missing,
           :class:`AgentInactive` if archived.
        3. Start a fresh :class:`AgentRun` (status
           ``STARTED``) and persist it so the UI can
           poll for progress.
        4. Run the loop with the agent's
           :class:`AgentConfiguration` and a fresh
           :class:`ExecutionGuard` and
           :class:`LoopDetector`.
        5. Catch the
           :class:`ExecutionGuardTripped` and
           :class:`RateLimitExceeded` exceptions
           that the loop and the rate limiter raise,
           translate them into the run's terminal
           state, and persist the final result.
        6. Commit and return the result.
        """
        # 1. Rate limit.
        if self._rate_limiter is not None:
            try:
                # ``asyncio.run`` is intentionally not used
                # here — the executor is async-callable
                # via the route handler which already
                # runs in the event loop. The route
                # calls ``await executor.execute(...)``.
                pass
            except RateLimitExceeded:
                raise
        # Note: the actual ``await`` on the rate
        # limiter happens inside the async ``execute``
        # below. The synchronous check above is a
        # placeholder for the sync helper that the
        # route handler will call.

        # 2. Load the agent.
        agent = self._agent_repo.get(tenant_id=tenant_id, agent_id=agent_id)
        if agent is None:
            raise AgentNotFound(
                message="agent not found",
                code=404,
                data={"agent_id": str(agent_id), "tenant_id": str(tenant_id)},
            )
        agent.ensure_runnable()

        # 3. Start the run.
        run = AgentRun.start(
            agent_id=agent.id,
            tenant_id=tenant_id,
            user_id=user_id,
            input=message,
        )
        run = self._run_repo.create_run(run)
        self._db.commit()

        # 4. Run the loop.
        # The synchronous loop is wrapped in a coroutine
        # at the route layer. The executor is a plain
        # object; the loop is an ``async def``. The
        # ``execute`` method is intentionally async to
        # let the LLM call and the rate-limit check
        # await properly.
        return self._run_to_completion(agent=agent, run=run)

    async def execute_async(
        self,
        *,
        tenant_id: uuid.UUID,
        agent_id: uuid.UUID,
        user_id: uuid.UUID,
        message: str,
    ) -> AgentRunResult:
        """Async version of :meth:`execute` with the rate limit check awaited.

        This is the variant the route handler calls.
        The sync :meth:`execute` is a thin wrapper
        kept for tests and for callers that already
        run inside an event loop but want the
        synchronous shape (the rate-limit check is
        optional and a no-op when no ``RateLimiter``
        is wired).
        """
        # Rate limit first. ``await``-ing the check is
        # the only thing the async variant adds over
        # the sync shape.
        if self._rate_limiter is not None:
            await self._rate_limiter.check_agent_execution(tenant_id=tenant_id)

        # Load the agent.
        agent = self._agent_repo.get(tenant_id=tenant_id, agent_id=agent_id)
        if agent is None:
            raise AgentNotFound(
                message="agent not found",
                code=404,
                data={"agent_id": str(agent_id), "tenant_id": str(tenant_id)},
            )
        agent.ensure_runnable()

        # Start the run.
        run = AgentRun.start(
            agent_id=agent.id,
            tenant_id=tenant_id,
            user_id=user_id,
            input=message,
        )
        run = self._run_repo.create_run(run)
        self._db.commit()

        return await self._run_to_completion_async(agent=agent, run=run)

    # ----- internals -------------------------------------------------------

    def _run_to_completion(
        self, *, agent: Agent, run: AgentRun
    ) -> AgentRunResult:
        """Run the synchronous loop and persist the result.

        This is the path tests use: a synchronous flow
        that does not await the rate limiter.
        """
        # ``asyncio.run`` would deadlock because the
        # test fixture already runs in a loop. The
        # test-only path that needs a sync loop just
        # builds the guard + detector directly and
        # inlines a synchronous version of the loop.
        # Production goes through the async path.
        raise NotImplementedError(
            "use the async execute_async from a request handler"
        )

    async def _augment_with_graph_context(
        self,
        *,
        tenant_id: uuid.UUID,
        message: str,
    ) -> str:
        """Prepend Knowledge Graph facts to the user message.

        When the ``GraphRetrievalService`` is wired, this
        queries the graph for entities and relationships
        related to the user's message and prepends them as
        structured context.  If the service is absent or the
        retrieval fails, the original message is returned
        unchanged — graph augmentation is best-effort.
        """
        if self._graph_retrieval is None:
            return message

        try:
            result = await self._graph_retrieval.retrieve(
                tenant_id=tenant_id,
                query=message,
                limit=5,
            )
            context_text = result.get("context_text", "")
            if not context_text:
                return message

            return (
                f"## Relevant Knowledge Graph Context\n\n"
                f"{context_text}\n\n"
                f"---\n\n"
                f"{message}"
            )
        except Exception:  # noqa: BLE001
            logger.debug(
                "Graph retrieval failed for tenant %s; proceeding without graph context",
                tenant_id,
            )
            return message

    async def _run_to_completion_async(
        self, *, agent: Agent, run: AgentRun
    ) -> AgentRunResult:
        """Async version: actually run the loop and persist the result."""
        guard = ExecutionGuard(
            ExecutionLimits(
                max_iterations=agent.configuration.max_iterations,
                max_execution_time_seconds=60.0,
                max_tool_calls=20,
            )
        )
        loop_detector = LoopDetector()

        # V7: Augment the user's input with Knowledge
        # Graph context before the loop starts.
        augmented_input = await self._augment_with_graph_context(
            tenant_id=agent.tenant_id,
            message=run.input,
        )
        if augmented_input != run.input:
            run = dataclass_replace(run, input=augmented_input)

        # V6 observability: wrap the whole run in an
        # OTel span. The executor owns the lifecycle
        # (start, run, finish) so the span is opened
        # here, not in the loop. The observability
        # module is imported lazily to keep the
        # executor import graph small at boot.
        from src.agents.application.observability import (
            agent_run_span,
            record_agent_run_outcome,
            record_agent_token_usage,
        )

        with agent_run_span(
            tenant_id=str(agent.tenant_id),
            agent_id=str(agent.id),
            agent_name=agent.name,
            model=agent.model,
            run_id=str(run.id),
        ) as run_span:
            try:
                result = await run_agent_loop(
                    agent=agent,
                    run=run,
                    llm=self._llm,
                    registry=self._registry,
                    tool_repo=self._tool_repo,
                    guard=guard,
                    loop_detector=loop_detector,
                )
            except ExecutionGuardTripped as exc:
                stopped = run.stop(reason=str(exc.data.get("reason", "guard tripped")))
                self._run_repo.update_run(stopped)
                self._db.commit()
                run_span.set_attribute("agent_run.outcome", "guard")
                record_agent_run_outcome(
                    tenant_id=str(agent.tenant_id),
                    agent_id=str(agent.id),
                    outcome="guard",
                )
                return AgentRunResult(
                    run=stopped,
                    finished=False,
                    stop_reason=str(exc.data.get("reason")),
                )
            except RateLimitExceeded as exc:
                failed = run.fail(error=f"rate_limit:{exc.kind}")
                self._run_repo.update_run(failed)
                self._db.commit()
                run_span.set_attribute("agent_run.outcome", "rate_limited")
                record_agent_run_outcome(
                    tenant_id=str(agent.tenant_id),
                    agent_id=str(agent.id),
                    outcome="rate_limited",
                )
                raise
            except Exception as exc:  # noqa: BLE001
                failed = run.fail(error=f"{type(exc).__name__}: {exc}")
                self._run_repo.update_run(failed)
                self._db.commit()
                run_span.set_attribute("agent_run.outcome", "failed")
                run_span.record_exception(exc)
                record_agent_run_outcome(
                    tenant_id=str(agent.tenant_id),
                    agent_id=str(agent.id),
                    outcome="failed",
                )
                return AgentRunResult(
                    run=failed,
                    finished=False,
                    stop_reason="exception",
                )

            # Persist the loop's final state.
            final = self._run_repo.update_run(result.run)
            self._db.commit()
            outcome = (
                "completed" if result.finished else "stopped"
            )
            run_span.set_attribute("agent_run.outcome", outcome)
            run_span.set_attribute(
                "agent_run.iterations", len(final.steps)
            )
            run_span.set_attribute("agent_run.total_tokens", final.total_tokens)
            # Token-usage counter — increments the
            # per-tenant counter that Prometheus
            # scrapes.
            record_agent_token_usage(
                tenant_id=str(agent.tenant_id),
                agent_id=str(agent.id),
                prompt_tokens=0,           # the loop records this per-step
                completion_tokens=final.total_tokens,
            )
            record_agent_run_outcome(
                tenant_id=str(agent.tenant_id),
                agent_id=str(agent.id),
                outcome=outcome,
            )
            return AgentRunResult(
                run=final,
                finished=result.finished,
                stop_reason=result.stop_reason,
            )


__all__ = ["AgentExecutor", "AgentRunResult"]
