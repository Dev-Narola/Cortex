"""
Domain entities for the agents bounded context.

Per the project's hexagonal layout, no entity in this file
imports from FastAPI, SQLAlchemy, boto3, or any infrastructure
concern. The rules enforced here must hold in unit tests
exactly as they hold in production.

Two aggregates live in this module:

* :class:`Agent` — the persistent, tenant-scoped *definition* of
  an agent. Slow-changing, owned by the tenant's users.
* :class:`AgentStatus` — the lifecycle of an agent. Three states:
  ACTIVE (default, runnable), INACTIVE (paused, runnable again
  after a status change), and ARCHIVED (terminal, read-only).

The :class:`AgentRun` aggregate (the *runtime* event of an agent
firing) lives in ``src.execution.domain.entities`` so the
"definition" and "execution" lifecycles are decoupled. This file
deliberately does not import from ``src.execution`` to keep the
agent definition free of execution-engine concerns.

Design choices:

* **Frozen dataclass + factory.** The dataclass is
  ``frozen=True`` so an agent cannot be mutated in place; every
  "change" is a new instance produced by :meth:`with_changes`.
  Construction goes through :meth:`create` so business rules
  (name required, system prompt required, archived agents cannot
  execute) are enforced in exactly one place.
* **Two construction paths.** :meth:`create` validates
  user-supplied input. :meth:`from_persistence` reconstructs the
  entity from the database and trusts the persisted state. The
  split mirrors the pattern in
  :mod:`src.identity.domain.entities` and keeps the validation
  logic out of the repository.
* **Tenant isolation is a property of the identity, not the
  shape.** Every method that takes a ``tenant_id`` argument
  requires it; the caller (the application service) is
  responsible for passing the *current* tenant, never the target
  tenant. The repository enforces the same invariant at the SQL
  layer.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Self

from src.agents.domain.exceptions import AgentInactive
from src.agents.domain.value_objects import AgentConfiguration


class AgentStatus(str, Enum):  # noqa: UP042 - intentional str-Enum for JSON round-trip
    """Lifecycle of an :class:`Agent`.

    The order is meaningful: an agent can transition from
    ``ACTIVE`` to ``INACTIVE`` and back; from either of those to
    ``ARCHIVED``; from ``ARCHIVED`` to nowhere. The transitions
    are explicit (see :meth:`Agent.archive`,
    :meth:`Agent.activate`, :meth:`Agent.deactivate`) so the
    rules live in one place.
    """

    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"

    @property
    def is_runnable(self) -> bool:
        """A runnable agent is one that can be executed right now.

        Only ``ACTIVE`` agents are runnable. ``INACTIVE`` is
        paused-by-owner; ``ARCHIVED`` is terminal.
        """
        return self is AgentStatus.ACTIVE

    @property
    def is_terminal(self) -> bool:
        """A terminal agent cannot transition to any other state."""
        return self is AgentStatus.ARCHIVED


@dataclass(frozen=True, slots=True)
class Agent:
    """The persistent definition of an AI agent.

    An :class:`Agent` is the *recipe* the executor uses to run
    one or more :class:`~src.execution.domain.entities.AgentRun`
    events. It is owned by a tenant, has a name and a system
    prompt, and a configuration that controls the loop.
    """

    # ----- identity ---------------------------------------------------------

    id: uuid.UUID
    tenant_id: uuid.UUID

    # ----- content ----------------------------------------------------------

    # The agent's display name. Required, non-empty. The
    # repository enforces a uniqueness constraint per-tenant on
    # this field.
    name: str
    description: str
    # The system prompt sent to the LLM at the start of every
    # run. Required, non-empty. Treated as opaque text by this
    # module; the executor concatenates it with the run's
    # conversation history before calling the LLM.
    system_prompt: str
    # The model identifier (e.g. ``"gpt-4o-mini"``,
    # ``"claude-3-5-sonnet"``). The executor resolves it through
    # the ``LLMProvider`` factory; this field is a string so a
    # tenant can target any provider the deployment supports.
    model: str

    # ----- lifecycle --------------------------------------------------------

    status: AgentStatus
    # The full configuration. Stored as a value object so the
    # constraints (``max_iterations > 0``, etc.) are enforced
    # at construction. The persistence layer serialises via
    # ``AgentConfiguration.to_dict``.
    configuration: AgentConfiguration

    # ----- timestamps -------------------------------------------------------

    created_at: datetime
    updated_at: datetime

    # ----- factories --------------------------------------------------------

    @classmethod
    def create(
        cls,
        *,
        tenant_id: uuid.UUID,
        name: str,
        system_prompt: str,
        model: str,
        description: str = "",
        configuration: AgentConfiguration | None = None,
        status: AgentStatus = AgentStatus.ACTIVE,
        now: datetime | None = None,
    ) -> Self:
        """Create a new agent for a tenant.

        All business-rule validation lives here. The caller
        (the application service) is responsible for translating
        the validation error into the appropriate HTTP response;
        the field-level checks raise the project-wide
        :class:`ValidationException` for that.
        """
        # Import locally to avoid a circular import at module
        # load — the shared exceptions module is the right
        # owner of the generic ValidationException.
        from src.shared.exceptions import ValidationException

        # --- name --------------------------------------------------------
        if not isinstance(name, str) or not name.strip():
            raise ValidationException(
                message="agent name is required",
                code=400,
                data={"field": "name"},
            )
        if len(name.strip()) > 255:
            raise ValidationException(
                message="agent name is too long (max 255 characters)",
                code=400,
                data={"field": "name", "constraint": "len(name.strip()) <= 255"},
            )

        # --- system prompt -----------------------------------------------
        if not isinstance(system_prompt, str) or not system_prompt.strip():
            raise ValidationException(
                message="agent system_prompt is required",
                code=400,
                data={"field": "system_prompt"},
            )

        # --- model -------------------------------------------------------
        if not isinstance(model, str) or not model.strip():
            raise ValidationException(
                message="agent model is required",
                code=400,
                data={"field": "model"},
            )

        # --- tenant ------------------------------------------------------
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(
                message="agent must belong to a tenant",
                code=400,
                data={"field": "tenant_id"},
            )

        # --- defaults ----------------------------------------------------
        now = now or datetime.now(UTC)
        cfg = configuration or AgentConfiguration()
        return cls(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            name=name.strip(),
            description=(description or "").strip(),
            system_prompt=system_prompt,
            model=model.strip(),
            status=status,
            configuration=cfg,
            created_at=now,
            updated_at=now,
        )

    @classmethod
    def from_persistence(
        cls,
        *,
        id: uuid.UUID,
        tenant_id: uuid.UUID,
        name: str,
        description: str,
        system_prompt: str,
        model: str,
        status: str | AgentStatus,
        configuration: dict[str, Any] | AgentConfiguration,
        created_at: datetime,
        updated_at: datetime,
    ) -> Self:
        """Reconstruct an agent from the persistence layer.

        Used by the repository when mapping a row to a domain
        entity. Trusts the persisted state — the validation
        rules in :meth:`create` are not re-applied. The caller
        must have already verified the row belongs to the
        requesting tenant.
        """
        if isinstance(status, str):
            status = AgentStatus(status)
        if isinstance(configuration, dict):
            configuration = AgentConfiguration.from_dict(configuration)
        return cls(
            id=id,
            tenant_id=tenant_id,
            name=name,
            description=description,
            system_prompt=system_prompt,
            model=model,
            status=status,
            configuration=configuration,
            created_at=created_at,
            updated_at=updated_at,
        )

    # ----- transitions -----------------------------------------------------

    def activate(self, *, now: datetime | None = None) -> Self:
        """Return a new instance with status=ACTIVE.

        Raises ``ValidationException`` if the agent is archived,
        because archived agents are terminal and cannot be
        re-activated. This is a "fail loud" check — a misbehaving
        caller (e.g. a UI that forgot to disable the "Activate"
        button) gets a clear 400 instead of a silently-ignored
        transition.
        """
        from src.shared.exceptions import ValidationException

        if self.status.is_terminal:
            raise ValidationException(
                message="archived agents cannot be reactivated",
                code=400,
                data={"field": "status", "current": self.status.value},
            )
        if self.status is AgentStatus.ACTIVE:
            return self
        return self._with(status=AgentStatus.ACTIVE, updated_at=now or datetime.now(UTC))

    def deactivate(self, *, now: datetime | None = None) -> Self:
        """Return a new instance with status=INACTIVE.

        ``ARCHIVED`` agents cannot be deactivated because they
        are already terminal.
        """
        from src.shared.exceptions import ValidationException

        if self.status.is_terminal:
            raise ValidationException(
                message="archived agents cannot be deactivated",
                code=400,
                data={"field": "status", "current": self.status.value},
            )
        if self.status is AgentStatus.INACTIVE:
            return self
        return self._with(status=AgentStatus.INACTIVE, updated_at=now or datetime.now(UTC))

    def archive(self, *, now: datetime | None = None) -> Self:
        """Return a new instance with status=ARCHIVED.

        Archiving is the only way to *delete* an agent while
        preserving its run history. The repository layer
        translates the status change to a soft delete (a
        ``deleted_at`` timestamp) so a hard DELETE never runs
        against the ``agent_runs`` foreign key.
        """
        if self.status.is_terminal:
            return self
        return self._with(status=AgentStatus.ARCHIVED, updated_at=now or datetime.now(UTC))

    # ----- execution guard -------------------------------------------------

    def ensure_runnable(self) -> None:
        """Raise :class:`AgentInactive` if the agent cannot be executed.

        Called at the start of every :class:`AgentRun` to make
        the "archived agents cannot execute" rule explicit and
        consistent. The exception is caught by the interface
        layer and translated into a 409.
        """
        if not self.status.is_runnable:
            raise AgentInactive(
                message="agent is not active and cannot be executed",
                code=409,
                data={
                    "agent_id": str(self.id),
                    "status": self.status.value,
                },
            )

    # ----- content updates -------------------------------------------------

    def with_changes(
        self,
        *,
        name: str | None = None,
        description: str | None = None,
        system_prompt: str | None = None,
        model: str | None = None,
        configuration: AgentConfiguration | None = None,
        now: datetime | None = None,
    ) -> Self:
        """Return a new instance with the given content fields updated.

        The dataclass is frozen, so updates are always
        copy-and-replace. ``None`` arguments mean "do not
        change". The update service passes only the fields the
        caller actually wants to change.
        """
        from src.shared.exceptions import ValidationException

        # Re-validate the fields the caller is changing. Empty
        # strings, etc., are rejected at the same boundary as
        # ``create`` so a misbehaving API cannot bypass
        # validation by going through "update" instead of
        # "create".
        if name is not None and not name.strip():
            raise ValidationException(
                message="agent name cannot be empty",
                code=400,
                data={"field": "name"},
            )
        if system_prompt is not None and not system_prompt.strip():
            raise ValidationException(
                message="agent system_prompt cannot be empty",
                code=400,
                data={"field": "system_prompt"},
            )
        if model is not None and not model.strip():
            raise ValidationException(
                message="agent model cannot be empty",
                code=400,
                data={"field": "model"},
            )

        return self._with(
            name=name.strip() if name is not None else self.name,
            description=description.strip() if description is not None else self.description,
            system_prompt=system_prompt if system_prompt is not None else self.system_prompt,
            model=model.strip() if model is not None else self.model,
            configuration=configuration if configuration is not None else self.configuration,
            updated_at=now or datetime.now(UTC),
        )

    # ----- helpers ---------------------------------------------------------

    def _with(self, **changes: Any) -> Self:
        """Internal ``dataclasses.replace`` wrapper for transitions + updates."""
        return replace(self, **changes)


__all__ = ["Agent", "AgentStatus"]
