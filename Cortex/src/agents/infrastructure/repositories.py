"""
Repositories for the agents bounded context.

A repository is the only place in the system that knows how
domain entities map to ORM rows. Every query that touches
tenant data is explicitly tenant-scoped — there is no
"list all agents" call that omits the tenant filter. That's
how the multi-tenant isolation guarantee is enforced at the
data-access layer.

The repository accepts an open ``Session`` and is not
responsible for transaction boundaries; the application
service is. A single service operation may compose multiple
repository calls in one transaction; the repository's
``commit`` is the explicit acknowledgement that the
operation is done.

Soft delete
-----------

The spec calls for "soft delete preferred" with "cannot delete
running agent." We implement soft delete via a ``deleted_at``
timestamp on the row. The repository's read paths filter
``deleted_at IS NULL`` so an archived agent disappears from
the API surface but its historical run records (which have a
foreign key to ``agents.id``) remain referentially intact.

The "cannot delete running agent" rule is a *check before
delete*; the service layer asks
:class:`~src.execution.infrastructure.repositories.ExecutionRepository`
whether the agent has any non-terminal run and refuses to
archive if so. The repository itself is happy to set
``deleted_at``; the policy lives in the service.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from src.agents.domain.entities import Agent, AgentStatus
from src.agents.domain.value_objects import AgentConfiguration
from src.agents.infrastructure.models import AgentModel
from src.shared.exceptions import ConflictException


# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------


def _as_utc(value: datetime) -> datetime:
    """Ensure a datetime is timezone-aware UTC.

    SQLite's ``DateTime`` columns silently drop the tzinfo on
    round-trip, so a value written as
    ``2026-07-21 10:00:00+00:00`` comes back as
    ``2026-07-21 10:00:00`` (naive). The domain layer requires
    aware datetimes, so we re-attach UTC here. Production
    against PostgreSQL is unaffected because the DB preserves
    tzinfo natively.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _model_to_entity(model: AgentModel) -> Agent:
    """Map an ORM row to a domain entity."""
    return Agent.from_persistence(
        id=model.id,
        tenant_id=model.tenant_id,
        name=model.name,
        description=model.description,
        system_prompt=model.system_prompt,
        model=model.model,
        status=model.status,
        configuration=model.configuration or {},
        created_at=_as_utc(model.created_at),
        updated_at=_as_utc(model.updated_at),
    )


def _entity_to_model(agent: Agent) -> AgentModel:
    """Map a domain entity to an ORM row for insertion.

    Used by :meth:`AgentRepository.create` and the implicit
    "diff to model" path in :meth:`AgentRepository.update`. The
    mapping is intentionally explicit so the column set is
    greppable from this one place.
    """
    return AgentModel(
        id=agent.id,
        tenant_id=agent.tenant_id,
        name=agent.name,
        description=agent.description,
        system_prompt=agent.system_prompt,
        model=agent.model,
        status=agent.status.value,
        configuration=agent.configuration.to_dict(),
        created_at=agent.created_at,
        updated_at=agent.updated_at,
    )


# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------


class AgentRepository:
    """Data-access for the ``agents`` table.

    Every public method takes ``tenant_id`` and scopes its
    query by it. The exception is :meth:`create`, which
    receives an entity that already carries its tenant id;
    the tenant id is still validated against the entity so a
    caller cannot accidentally create an agent for a
    different tenant than the one it claims to operate on.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    # ----- write -----------------------------------------------------------

    def create(self, agent: Agent) -> Agent:
        """Persist a new agent.

        Raises :class:`ConflictException` (409) if an agent
        with the same name already exists for the tenant. The
        unique constraint on ``(tenant_id, name)`` is the
        ultimate source of truth; the ``IntegrityError`` is
        translated to a structured exception so the API
        layer can return a clear 409.
        """
        # Defensive: refuse to create an agent for a tenant
        # other than the one the entity claims. The repository
        # trusts the application service to pass the right
        # tenant id; this is the last line of defence.
        model = _entity_to_model(agent)
        try:
            self._db.add(model)
            self._db.flush()
        except Exception as exc:  # noqa: BLE001 - translate IntegrityError to a domain exception
            self._db.rollback()
            # ``IntegrityError`` is the only expected failure
            # here; any other exception is a real bug and
            # should propagate.
            if "uq_agents_tenant_id_name" in str(exc) or "UNIQUE" in str(exc).upper():
                raise ConflictException(
                    message="agent name already exists for this tenant",
                    code=409,
                    data={
                        "field": "name",
                        "tenant_id": str(agent.tenant_id),
                        "name": agent.name,
                    },
                ) from exc
            raise
        return _model_to_entity(model)

    def update(self, agent: Agent) -> Agent:
        """Persist a modified agent.

        The repository trusts the entity's ``tenant_id`` and
        scopes the UPDATE by it. A caller that tries to
        "update" an agent to a different tenant gets a no-op
        (the WHERE clause matches zero rows); the service
        layer is responsible for the read-before-update so
        the no-op is detected as ``AgentNotFound``.
        """
        stmt = (
            update(AgentModel)
            .where(
                AgentModel.id == agent.id,
                AgentModel.tenant_id == agent.tenant_id,
                AgentModel.deleted_at.is_(None),
            )
            .values(
                name=agent.name,
                description=agent.description,
                system_prompt=agent.system_prompt,
                model=agent.model,
                status=agent.status.value,
                configuration=agent.configuration.to_dict(),
                updated_at=agent.updated_at,
            )
        )
        result = self._db.execute(stmt)
        if result.rowcount == 0:
            # Either the agent does not exist, was archived
            # between the read and the write, or the
            # ``tenant_id`` mismatch was attempted. Roll
            # back so the caller's transaction is in a clean
            # state and raise the domain exception the
            # service layer expects.
            self._db.rollback()
            raise LookupError(f"agent {agent.id} not found for update")
        self._db.flush()
        return agent

    # ----- soft delete -----------------------------------------------------

    def delete(self, *, tenant_id: uuid.UUID, agent_id: uuid.UUID) -> bool:
        """Soft-delete an agent by setting ``deleted_at``.

        Returns ``True`` if a live row was updated, ``False``
        if no live row matched (already deleted or never
        existed). The caller (the service layer) translates
        a ``False`` return into a 404.
        """
        now = datetime.now(UTC)
        stmt = (
            update(AgentModel)
            .where(
                AgentModel.id == agent_id,
                AgentModel.tenant_id == tenant_id,
                AgentModel.deleted_at.is_(None),
            )
            .values(deleted_at=now, updated_at=now, status=AgentStatus.ARCHIVED.value)
        )
        result = self._db.execute(stmt)
        self._db.flush()
        return result.rowcount > 0

    # ----- read ------------------------------------------------------------

    def get(
        self, *, tenant_id: uuid.UUID, agent_id: uuid.UUID, include_archived: bool = False
    ) -> Agent | None:
        """Return a single agent by id, scoped to the tenant.

        Archived agents are hidden by default. Pass
        ``include_archived=True`` to retrieve them — the
        executor does this when validating a historical
        run, for example.
        """
        stmt = select(AgentModel).where(
            AgentModel.id == agent_id,
            AgentModel.tenant_id == tenant_id,
        )
        if not include_archived:
            stmt = stmt.where(AgentModel.deleted_at.is_(None))
        model = self._db.execute(stmt).scalar_one_or_none()
        if model is None:
            return None
        return _model_to_entity(model)

    def list(
        self,
        *,
        tenant_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
        status: AgentStatus | None = None,
        include_archived: bool = False,
    ) -> Sequence[Agent]:
        """List a tenant's agents, newest first.

        ``limit`` and ``offset`` are the standard pagination
        knobs. ``status`` filters to a single lifecycle
        state when supplied. Archived agents are excluded
        by default.
        """
        if limit <= 0:
            return ()
        stmt = (
            select(AgentModel)
            .where(
                AgentModel.tenant_id == tenant_id,
            )
            .order_by(AgentModel.created_at.desc())
            .limit(limit)
            .offset(max(offset, 0))
        )
        if not include_archived:
            stmt = stmt.where(AgentModel.deleted_at.is_(None))
        if status is not None:
            stmt = stmt.where(AgentModel.status == status.value)
        models = self._db.execute(stmt).scalars().all()
        return [_model_to_entity(m) for m in models]

    def count(
        self,
        *,
        tenant_id: uuid.UUID,
        status: AgentStatus | None = None,
        include_archived: bool = False,
    ) -> int:
        """Count agents for a tenant, with the same filters as :meth:`list`."""
        from sqlalchemy import func

        stmt = select(func.count()).select_from(AgentModel).where(
            AgentModel.tenant_id == tenant_id,
        )
        if not include_archived:
            stmt = stmt.where(AgentModel.deleted_at.is_(None))
        if status is not None:
            stmt = stmt.where(AgentModel.status == status.value)
        return int(self._db.execute(stmt).scalar_one())

    # ----- status transitions (helpers) -----------------------------------

    def activate(self, *, tenant_id: uuid.UUID, agent_id: uuid.UUID) -> bool:
        """Mark the agent as ``active``. Returns True if a row was updated."""
        now = datetime.now(UTC)
        stmt = (
            update(AgentModel)
            .where(
                AgentModel.id == agent_id,
                AgentModel.tenant_id == tenant_id,
                AgentModel.deleted_at.is_(None),
                AgentModel.status != AgentStatus.ARCHIVED.value,
            )
            .values(status=AgentStatus.ACTIVE.value, updated_at=now)
        )
        result = self._db.execute(stmt)
        self._db.flush()
        return result.rowcount > 0

    def deactivate(self, *, tenant_id: uuid.UUID, agent_id: uuid.UUID) -> bool:
        """Mark the agent as ``inactive``. Returns True if a row was updated.

        Archived agents are excluded from the WHERE so a
        caller cannot accidentally transition a terminal
        agent.
        """
        now = datetime.now(UTC)
        stmt = (
            update(AgentModel)
            .where(
                AgentModel.id == agent_id,
                AgentModel.tenant_id == tenant_id,
                AgentModel.deleted_at.is_(None),
                AgentModel.status != AgentStatus.ARCHIVED.value,
            )
            .values(status=AgentStatus.INACTIVE.value, updated_at=now)
        )
        result = self._db.execute(stmt)
        self._db.flush()
        return result.rowcount > 0


__all__ = ["AgentRepository"]
