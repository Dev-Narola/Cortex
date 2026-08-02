"""
Tests for the :class:`ToolRegistry` in
:mod:`src.tools.application.registry`.

The registry is the in-process handler store. Tests
cover:

* registering a global handler (tenant_id=None) and
  a tenant-specific override,
* tenant-specific handler shadows the global one for
  that tenant only,
* removing a handler,
* the agent-may-use permission check.
"""

from __future__ import annotations

import pytest

from src.tools.application.registry import ToolRegistry
from src.tools.domain.interfaces import BaseTool


class _NoopTool(BaseTool):
    def __init__(self, name: str) -> None:
        self._name = name

    @property
    def name(self) -> str:
        return self._name

    def describe(self) -> dict:
        return {
            "name": self._name,
            "description": "noop",
            "parameters": {"type": "object", "properties": {}},
        }

    async def execute(self, **kwargs):
        return {}


def test_register_global_handler_resolves_for_any_tenant():
    reg = ToolRegistry()
    reg.register(_NoopTool("search"))
    assert reg.has_handler(name="search", tenant_id="A")
    assert reg.has_handler(name="search", tenant_id="B")


def test_tenant_specific_handler_shadows_global():
    reg = ToolRegistry()
    reg.register(_NoopTool("search"))  # global
    reg.register(_NoopTool("search"), tenant_id="A")  # tenant override
    handler_a = reg.get_handler(name="search", tenant_id="A")
    handler_b = reg.get_handler(name="search", tenant_id="B")
    # Both succeed; A gets the override, B gets the
    # global. The objects are different instances.
    assert handler_a is not handler_b


def test_remove_handler():
    reg = ToolRegistry()
    reg.register(_NoopTool("search"))
    assert reg.remove(name="search") is True
    assert not reg.has_handler(name="search", tenant_id="A")
    # Removing a non-existent handler returns False.
    assert reg.remove(name="nope") is False


def test_get_handler_missing_raises_not_found():
    reg = ToolRegistry()
    from src.shared.exceptions import NotFoundException
    with pytest.raises(NotFoundException):
        reg.get_handler(name="missing", tenant_id="A")


def test_agent_may_use_no_allowlist_allows_all():
    reg = ToolRegistry()
    assert reg.agent_may_use(agent_allowed_tools=None, tool_name="search")
    assert reg.agent_may_use(agent_allowed_tools=None, tool_name="anything")


def test_agent_may_use_explicit_allowlist_filters():
    reg = ToolRegistry()
    allow = frozenset({"search", "calculator"})
    assert reg.agent_may_use(agent_allowed_tools=allow, tool_name="search")
    assert reg.agent_may_use(agent_allowed_tools=allow, tool_name="calculator")
    assert not reg.agent_may_use(agent_allowed_tools=allow, tool_name="admin")
