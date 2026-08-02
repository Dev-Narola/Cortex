"""
Domain entities for the tools bounded context.

A :class:`Tool` is a *registered capability* that an agent can
invoke at execution time. The tool is described to the LLM
by its ``name``, ``description``, and ``input_schema`` (a
JSON Schema document), and executed by a registered
``BaseTool`` implementation in the application layer.

Per the project's hexagonal rule, this module has no imports
from FastAPI, SQLAlchemy, or any infrastructure concern.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Self

from src.shared.exceptions import ValidationException


class ToolStatus(str, Enum):  # noqa: UP042 - intentional str-Enum for JSON round-trip
    """Lifecycle of a :class:`Tool`.

    ``ACTIVE`` is the default and the only state in which
    the executor is allowed to invoke the tool.
    ``DISABLED`` is a soft-off switch — a tenant owner can
    disable a tool without unregistering it. A tool that has
    been permanently retired should be deleted from the
    registry, not just disabled.
    """

    ACTIVE = "active"
    DISABLED = "disabled"

    @property
    def is_usable(self) -> bool:
        return self is ToolStatus.ACTIVE


@dataclass(frozen=True, slots=True)
class Tool:
    """The persistent definition of a tool.

    The handler is *not* stored on the entity; it is a
    runtime instance registered in the
    :class:`~src.tools.application.registry.ToolRegistry`.
    The persistence layer stores the schema (so the LLM
    can be told what the tool does) and the permissions
    list (so the registry can enforce per-agent access).
    """

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str
    # A JSON Schema document describing the tool's accepted
    # input. Stored as a plain dict so it round-trips
    # through JSONB on PostgreSQL and TEXT on SQLite without
    # a custom adapter.
    input_schema: dict[str, Any]
    # The class name (or fully-qualified dotted path) of the
    # registered handler. The registry looks up the
    # implementation by this name; a misconfigured name
    # surfaces as :class:`ToolNotFound` at execution time.
    handler: str
    status: ToolStatus
    # Permission list — tool names this tool is allowed to
    # chain to. Empty list = no chained tools. ``None``
    # means "any tool" (use sparingly; this is the same
    # semantics as the agent's ``allowed_tools``).
    permissions: tuple[str, ...] | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    # ----- factories --------------------------------------------------------

    @classmethod
    def create(
        cls,
        *,
        tenant_id: uuid.UUID,
        name: str,
        description: str,
        input_schema: dict[str, Any],
        handler: str,
        permissions: tuple[str, ...] | None = None,
        status: ToolStatus = ToolStatus.ACTIVE,
        now: datetime | None = None,
    ) -> Self:
        """Validate and create a new tool definition.

        Rules:

        * ``name`` must be non-empty, ≤ 64 characters, and
          match ``^[a-z][a-z0-9_]*$`` — the same constraint
          the LLM tool-calling APIs use, so a tenant can
          never register a tool whose name the LLM would
          reject.
        * ``input_schema`` must be a non-empty dict.
        * ``handler`` must be a non-empty string.
        """
        if not isinstance(name, str) or not name.strip():
            raise ValidationException(
                message="tool name is required",
                code=400,
                data={"field": "name"},
            )
        name = name.strip()
        if len(name) > 64 or not name.replace("_", "").isalnum() or not name[0].isalpha() or name != name.lower():
            raise ValidationException(
                message="tool name must be lowercase, start with a letter, contain only [a-z0-9_], and be at most 64 characters",
                code=400,
                data={"field": "name", "value": name},
            )
        if not isinstance(description, str) or not description.strip():
            raise ValidationException(
                message="tool description is required",
                code=400,
                data={"field": "description"},
            )
        if not isinstance(input_schema, dict) or not input_schema:
            raise ValidationException(
                message="tool input_schema must be a non-empty JSON Schema object",
                code=400,
                data={"field": "input_schema"},
            )
        if not isinstance(handler, str) or not handler.strip():
            raise ValidationException(
                message="tool handler is required",
                code=400,
                data={"field": "handler"},
            )
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(
                message="tool must belong to a tenant",
                code=400,
                data={"field": "tenant_id"},
            )

        now = now or datetime.now(UTC)
        return cls(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            name=name,
            description=description.strip(),
            input_schema=input_schema,
            handler=handler.strip(),
            status=status,
            permissions=permissions,
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
        input_schema: dict[str, Any],
        handler: str,
        status: str | ToolStatus,
        permissions: tuple[str, ...] | list[str] | None,
        created_at: datetime,
        updated_at: datetime,
    ) -> Self:
        if isinstance(status, str):
            status = ToolStatus(status)
        if isinstance(permissions, list):
            permissions = tuple(permissions)
        return cls(
            id=id,
            tenant_id=tenant_id,
            name=name,
            description=description,
            input_schema=input_schema,
            handler=handler,
            status=status,
            permissions=permissions,
            created_at=created_at,
            updated_at=updated_at,
        )

    # ----- transitions -----------------------------------------------------

    def disable(self, *, now: datetime | None = None) -> Self:
        if self.status is ToolStatus.DISABLED:
            return self
        return replace(self, status=ToolStatus.DISABLED, updated_at=now or datetime.now(UTC))

    def enable(self, *, now: datetime | None = None) -> Self:
        if self.status is ToolStatus.ACTIVE:
            return self
        return replace(self, status=ToolStatus.ACTIVE, updated_at=now or datetime.now(UTC))


__all__ = ["Tool", "ToolStatus"]
