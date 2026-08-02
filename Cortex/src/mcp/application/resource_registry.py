"""
MCP Resource Registry for reading data resources exposed to external AI clients.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Callable, Awaitable

from src.mcp.domain.exceptions import ResourceAccessDenied


@dataclass(frozen=True, slots=True)
class MCPResourceDefinition:
    """Definition of an MCP data resource."""

    uri_template: str
    name: str
    description: str
    mime_type: str = "application/json"
    category: str = "general"


class ResourceRegistry:
    """Registry maintaining data resources exposed over the Model Context Protocol."""

    def __init__(self) -> None:
        self._resources: dict[str, MCPResourceDefinition] = {}
        self._register_default_cortex_resources()

    def _register_default_cortex_resources(self) -> None:
        """Register the default Cortex resources specified in V8."""
        self.register(
            MCPResourceDefinition(
                uri_template="cortex://knowledge/document/{id}",
                name="Knowledge Document",
                description="Read a knowledge document by UUID",
                mime_type="application/json",
                category="knowledge",
            )
        )
        self.register(
            MCPResourceDefinition(
                uri_template="cortex://graph/entity/{id}",
                name="Graph Entity",
                description="Read a Knowledge Graph entity by UUID",
                mime_type="application/json",
                category="knowledge_graph",
            )
        )
        self.register(
            MCPResourceDefinition(
                uri_template="cortex://graph/path/{id}",
                name="Graph Path",
                description="Read graph path and neighbor connections",
                mime_type="application/json",
                category="knowledge_graph",
            )
        )
        self.register(
            MCPResourceDefinition(
                uri_template="cortex://memory/{id}",
                name="Agent Memory",
                description="Read agent execution memory by Run UUID",
                mime_type="application/json",
                category="agent",
            )
        )
        self.register(
            MCPResourceDefinition(
                uri_template="cortex://tenant/settings",
                name="Tenant Settings",
                description="Read current tenant settings",
                mime_type="application/json",
                category="tenant",
            )
        )

    def register(self, resource: MCPResourceDefinition) -> None:
        self._resources[resource.uri_template] = resource

    def list_resources(self) -> list[dict[str, Any]]:
        out = []
        for r in self._resources.values():
            out.append(
                {
                    "uri": r.uri_template,
                    "name": r.name,
                    "description": r.description,
                    "mimeType": r.mime_type,
                }
            )
        return out


__all__ = ["MCPResourceDefinition", "ResourceRegistry"]
