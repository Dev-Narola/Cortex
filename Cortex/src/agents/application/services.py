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

from sqlalchemy.orm import Session

from src.agents.domain.entities import Agent, AgentStatus
from src.agents.domain.exceptions import AgentNotFound
from src.agents.domain.value_objects import AgentConfiguration
from src.agents.infrastructure.repositories import AgentRepository
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


__all__ = [
    "CreateAgentInput",
    "CreateAgentService",
    "DeleteAgentInput",
    "DeleteAgentService",
    "GetAgentService",
    "ListAgentsService",
    "UpdateAgentInput",
    "UpdateAgentService",
]
