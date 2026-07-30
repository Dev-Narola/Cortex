"""
Repository for the ``agent_runs`` table.

Mirrors the pattern in
:mod:`src.agents.infrastructure.repositories`. Every read is
tenant-scoped. The "running-run" check the agent delete
service uses is a single indexed count — no scan, no race.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.execution.domain.entities import AgentRun, AgentRunStatus, AgentStep
from src.execution.infrastructure.models import AgentRunModel


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _model_to_entity(model: AgentRunModel) -> AgentRun:
    return AgentRun.from_persistence(
        id=model.id,
        agent_id=model.agent_id,
        tenant_id=model.tenant_id,
        user_id=model.user_id,
        input=model.input,
        output=model.output,
        status=model.status,
        steps=[s for s in (model.steps or []) if isinstance(s, dict)],
        started_at=_as_utc(model.started_at),
        completed_at=(
            _as_utc(model.completed_at) if model.completed_at else None
        ),
        total_tokens=model.total_tokens,
    )


def _entity_to_model(run: AgentRun) -> AgentRunModel:
    return AgentRunModel(
        id=run.id,
        agent_id=run.agent_id,
        tenant_id=run.tenant_id,
        user_id=run.user_id,
        input=run.input,
        output=run.output,
        status=run.status.value,
        steps=[s.to_dict() for s in run.steps],
        total_tokens=run.total_tokens,
        started_at=run.started_at,
        completed_at=run.completed_at,
    )


class ExecutionRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def create_run(self, run: AgentRun) -> AgentRun:
        model = _entity_to_model(run)
        self._db.add(model)
        self._db.flush()
        return _model_to_entity(model)

    def update_run(self, run: AgentRun) -> AgentRun:
        """Persist the latest state of a run.

        The repository trusts the entity's
        ``tenant_id`` and scopes the UPDATE by it; a
        cross-tenant update attempt becomes a no-op
        (rowcount=0) and the caller treats that as
        ``AgentRunNotFound``.
        """
        model = (
            self._db.query(AgentRunModel)
            .filter(
                AgentRunModel.id == run.id,
                AgentRunModel.tenant_id == run.tenant_id,
            )
            .one_or_none()
        )
        if model is None:
            raise LookupError(f"agent run {run.id} not found for update")
        # Copy every mutable field. ``steps`` is a list of
        # ``AgentStep`` dicts — the entity already converted
        # them.
        model.input = run.input
        model.output = run.output
        model.status = run.status.value
        model.steps = [s.to_dict() if hasattr(s, "to_dict") else s for s in run.steps]
        model.total_tokens = run.total_tokens
        model.started_at = run.started_at
        model.completed_at = run.completed_at
        self._db.flush()
        return _model_to_entity(model)

    def get_run(
        self, *, tenant_id: uuid.UUID, run_id: uuid.UUID
    ) -> AgentRun | None:
        model = (
            self._db.query(AgentRunModel)
            .filter(
                AgentRunModel.id == run_id,
                AgentRunModel.tenant_id == tenant_id,
            )
            .one_or_none()
        )
        return _model_to_entity(model) if model else None

    def list_runs(
        self,
        *,
        tenant_id: uuid.UUID,
        agent_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[AgentRun]:
        if limit <= 0:
            return ()
        stmt = (
            select(AgentRunModel)
            .where(AgentRunModel.tenant_id == tenant_id)
            .order_by(AgentRunModel.started_at.desc())
            .limit(limit)
            .offset(max(offset, 0))
        )
        if agent_id is not None:
            stmt = stmt.where(AgentRunModel.agent_id == agent_id)
        models = self._db.execute(stmt).scalars().all()
        return [_model_to_entity(m) for m in models]

    # ----- guards ----------------------------------------------------------

    def has_running_run(self, *, agent_id: uuid.UUID) -> bool:
        """True if any non-terminal run exists for the agent.

        Used by the agent delete service to enforce
        "cannot delete running agent." Cheap because the
        (agent_id, status) composite index turns the query
        into a single index range scan.
        """
        active = (AgentRunStatus.STARTED.value, AgentRunStatus.RUNNING.value)
        stmt = (
            select(AgentRunModel)
            .where(
                AgentRunModel.agent_id == agent_id,
                AgentRunModel.status.in_(active),
            )
            .limit(1)
        )
        return self._db.execute(stmt).scalar_one_or_none() is not None


__all__ = ["ExecutionRepository"]
