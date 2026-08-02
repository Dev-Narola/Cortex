"""
Value objects for the Model Context Protocol (MCP) bounded context.

These objects define standard transport types, capabilities,
session states, client types, and protocol versioning per the MCP spec.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Self


class MCPTransport(str, Enum):
    """Supported transport mechanisms for MCP communication."""

    STDIO = "stdio"
    HTTP = "http"
    WEBSOCKET = "websocket"


class MCPCapability(str, Enum):
    """Protocol capabilities supported by Cortex MCP server and clients."""

    TOOLS = "tools"
    RESOURCES = "resources"
    PROMPTS = "prompts"
    SAMPLING = "sampling"
    LOGGING = "logging"
    COMPLETION = "completion"
    STREAMING = "streaming"
    PROGRESS = "progress"
    CANCELLATION = "cancellation"


class MCPSessionState(str, Enum):
    """Lifecycle states for an active MCP client session."""

    INITIALIZING = "initializing"
    CONNECTED = "connected"
    AUTHENTICATED = "authenticated"
    ACTIVE = "active"
    DISCONNECTED = "disconnected"
    EXPIRED = "expired"


class MCPClientType(str, Enum):
    """Types of external applications connecting to Cortex MCP."""

    DESKTOP = "desktop"
    CLI = "cli"
    WEB = "web"
    IDE = "ide"
    SERVER = "server"
    CUSTOM = "custom"


@dataclass(frozen=True, slots=True)
class MCPProtocolVersion:
    """Semantic versioning for MCP protocol negotiation."""

    major: int = 1
    minor: int = 0
    patch: int = 0

    @classmethod
    def parse(cls, version_str: str) -> Self:
        """Parse version string 'X.Y.Z' into MCPProtocolVersion."""
        parts = version_str.strip().split(".")
        if len(parts) != 3 or not all(p.isdigit() for p in parts):
            return cls(major=1, minor=0, patch=0)
        return cls(
            major=int(parts[0]),
            minor=int(parts[1]),
            patch=int(parts[2]),
        )

    def is_compatible_with(self, other: MCPProtocolVersion) -> bool:
        """Check compatibility. Same major version is required."""
        return self.major == other.major

    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"


__all__ = [
    "MCPCapability",
    "MCPClientType",
    "MCPProtocolVersion",
    "MCPSessionState",
    "MCPTransport",
]
