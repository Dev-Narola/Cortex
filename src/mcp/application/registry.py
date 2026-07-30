"""
Capability Registry for MCP server and client feature negotiation.
"""

from __future__ import annotations

import uuid
from typing import Any

from src.mcp.domain.value_objects import MCPCapability


class CapabilityRegistry:
    """Registry managing available MCP capabilities per tenant / client."""

    def __init__(self) -> None:
        self._server_capabilities: set[MCPCapability] = {
            MCPCapability.TOOLS,
            MCPCapability.RESOURCES,
            MCPCapability.PROMPTS,
            MCPCapability.STREAMING,
            MCPCapability.PROGRESS,
            MCPCapability.CANCELLATION,
            MCPCapability.LOGGING,
            MCPCapability.COMPLETION,
        }

    def list_server_capabilities(self) -> list[str]:
        """Return list of capabilities supported by Cortex MCP server."""
        return [c.value for c in self._server_capabilities]

    def resolve_capabilities(
        self, client_capabilities: list[str] | None = None
    ) -> dict[str, Any]:
        """Format capabilities dict for MCP initialize response."""
        res: dict[str, Any] = {}
        for cap in self._server_capabilities:
            res[cap.value] = {}
        return res

    def supports(self, capability: MCPCapability | str) -> bool:
        cap_enum = MCPCapability(capability) if isinstance(capability, str) else capability
        return cap_enum in self._server_capabilities


__all__ = ["CapabilityRegistry"]
