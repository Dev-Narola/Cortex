"""
Tool registry for the agents bounded context.

The registry is the in-process store of
:class:`~src.tools.domain.interfaces.BaseTool` implementations
keyed by their ``name``. The executor looks up the live
handler here at run time; the persistent
:class:`~src.tools.domain.entities.Tool` entity is the
*description* (schema, permissions, tenant id) and the
*handler* field is a pointer into this registry.

Two layers, on purpose:

* The persistent :class:`Tool` entity exists in the
  database. A tenant can see all the tools they have
  registered, can disable them, can revoke them.
* The live handler is a Python object in process memory.
  The same handler can be used by many tenants (so a
  built-in ``KnowledgeSearchTool`` ships once and is
  reused for every tenant) or be a tenant-specific
  override.

The split is what lets the spec's Tasks 10 and 11
("BaseTool interface" + "ToolRegistry") be implemented
without forcing every concrete tool into the database.
"""

from __future__ import annotations

import threading
from typing import TYPE_CHECKING

from src.shared.exceptions import NotFoundException
from src.tools.domain.entities import Tool, ToolStatus
from src.tools.domain.interfaces import BaseTool

if TYPE_CHECKING:
    from src.tools.infrastructure.repositories import ToolRepository


class ToolRegistry:
    """In-process handler store + persistence-backed catalog.

    Thread-safe: registration and lookup run under a
    single lock because the registry is a process-wide
    resource, not a per-request object. The lock is held
    only across the dict mutation or lookup — not across
    a tool's :meth:`execute` call.

    The registry is the *single source of truth* for
    "which handler runs for a given tool name, in a given
    tenant". The persistent :class:`Tool` row in the
    database is the audit record, not the source of truth.
    """

    def __init__(self) -> None:
        # handler_key -> (BaseTool instance, optional tenant_id)
        # ``tenant_id is None`` means the handler is
        # available to every tenant (a built-in). A
        # tenant-specific override is keyed by name and
        # tenant.
        self._handlers: dict[tuple[str, str | None], BaseTool] = {}
        self._lock = threading.Lock()

    # ----- handler registration -------------------------------------------

    def register(
        self,
        tool: BaseTool,
        *,
        tenant_id: str | None = None,
    ) -> None:
        """Register a handler under its :attr:`name`.

        ``tenant_id=None`` registers a global handler,
        available to every tenant. A tenant-specific
        registration shadows the global handler for that
        tenant only.
        """
        with self._lock:
            self._handlers[(tool.name, tenant_id)] = tool

    def remove(self, *, name: str, tenant_id: str | None = None) -> bool:
        """Unregister a handler. Returns True if a handler was removed."""
        with self._lock:
            return self._handlers.pop((name, tenant_id), None) is not None

    # ----- resolution -----------------------------------------------------

    def get_handler(
        self,
        *,
        name: str,
        tenant_id: str,
    ) -> BaseTool:
        """Resolve the live handler for a tool name + tenant.

        Tenant-specific first, then global. Raises
        :class:`NotFoundException` if no handler is
        registered for the tool. The executor translates
        that into a structured error to the LLM.
        """
        with self._lock:
            handler = self._handlers.get((name, tenant_id))
            if handler is None:
                handler = self._handlers.get((name, None))
        if handler is None:
            raise NotFoundException(
                message=f"no handler registered for tool '{name}'",
                code=404,
                data={"tool": name, "tenant_id": tenant_id},
            )
        return handler

    def has_handler(self, *, name: str, tenant_id: str | None = None) -> bool:
        """True if a handler is registered for this name (+ optional tenant)."""
        with self._lock:
            return (name, tenant_id) in self._handlers or (name, None) in self._handlers

    def list_handlers(self) -> list[BaseTool]:
        """Return a snapshot of the registered handlers (for diagnostics)."""
        with self._lock:
            return list({k[0]: v for k, v in self._handlers.items()}.values())

    # ----- tenant-aware catalog -------------------------------------------

    def list_tools(
        self,
        *,
        repo: "ToolRepository | None" = None,
        tenant_id: "str | uuid.UUID",
    ) -> list[Tool]:
        """List the *persistent* tools a tenant has registered.

        Returns the catalog from the database (``repo.list``).
        The live handlers are resolved lazily by the
        executor; a tool with no registered handler is
        visible in the catalog but cannot be invoked.

        If ``repo`` is ``None``, returns an empty list —
        the registry works for handler resolution without
        a database, which is useful at boot time before
        the DB is connected.

        ``tenant_id`` is normalised to a real
        ``uuid.UUID`` for the repository call (the
        SQLAlchemy ``Uuid`` type binds the column by
        calling ``.hex`` on the value, which fails for
        strings). The string form is what the rest of
        the registry uses internally.
        """
        if repo is None:
            return []
        import uuid as _uuid
        if isinstance(tenant_id, str):
            tenant_uuid = _uuid.UUID(tenant_id)
        else:
            tenant_uuid = tenant_id
        return list(repo.list(tenant_id=tenant_uuid, status=ToolStatus.ACTIVE))

    # ----- permission checks ----------------------------------------------

    def agent_may_use(
        self,
        *,
        agent_allowed_tools: frozenset[str] | None,
        tool_name: str,
    ) -> bool:
        """True if the agent is allowed to invoke a given tool.

        The agent's ``AgentConfiguration.allowed_tools`` is
        the authoritative filter; a value of ``None`` means
        "all tools the registry has granted to this agent".
        A non-None value is an explicit allow-list; the
        tool is permitted iff its name is in the set.
        """
        if agent_allowed_tools is None:
            return True
        return tool_name in agent_allowed_tools


__all__ = ["ToolRegistry"]
