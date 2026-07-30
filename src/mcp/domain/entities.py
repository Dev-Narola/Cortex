"""
Domain entities for the Model Context Protocol (MCP) bounded context.

Entities:
* MCPSession — A single connected session from an external AI client.
* MCPClient — A registered external client application (e.g. Claude Desktop, Cursor).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from typing import Any, Self

from src.mcp.domain.value_objects import (
    MCPCapability,
    MCPClientType,
    MCPSessionState,
    MCPTransport,
)
from src.shared.exceptions import ValidationException


@dataclass(frozen=True, slots=True)
class MCPClient:
    """A registered external AI client application allowed to interact with Cortex."""

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    client_type: MCPClientType
    version: str
    allowed_capabilities: tuple[MCPCapability, ...]
    allowed_tools: tuple[str, ...]
    allowed_resources: tuple[str, ...]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def create(
        cls,
        *,
        tenant_id: uuid.UUID,
        name: str,
        client_type: MCPClientType | str = MCPClientType.CUSTOM,
        version: str = "1.0.0",
        allowed_capabilities: tuple[MCPCapability | str, ...] = (),
        allowed_tools: tuple[str, ...] = (),
        allowed_resources: tuple[str, ...] = (),
        now: datetime | None = None,
    ) -> Self:
        if not isinstance(tenant_id, uuid.UUID):
            raise ValidationException(message="tenant_id must be a UUID", code=400)
        if not isinstance(name, str) or not name.strip():
            raise ValidationException(message="client name is required", code=400)

        ctype = MCPClientType(client_type) if isinstance(client_type, str) else client_type
        caps = tuple(
            MCPCapability(c) if isinstance(c, str) else c for c in allowed_capabilities
        )

        current_time = now or datetime.now(UTC)
        return cls(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            name=name.strip(),
            client_type=ctype,
            version=version.strip(),
            allowed_capabilities=caps,
            allowed_tools=tuple(allowed_tools),
            allowed_resources=tuple(allowed_resources),
            is_active=True,
            created_at=current_time,
            updated_at=current_time,
        )


@dataclass(frozen=True, slots=True)
class MCPSession:
    """An active session created when an external client connects to Cortex."""

    id: uuid.UUID
    tenant_id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    client_version: str
    transport: MCPTransport
    state: MCPSessionState
    created_at: datetime
    last_activity: datetime
    expires_at: datetime
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        *,
        tenant_id: uuid.UUID,
        client_id: uuid.UUID,
        client_name: str,
        client_version: str = "1.0.0",
        transport: MCPTransport | str = MCPTransport.WEBSOCKET,
        timeout_seconds: int = 1800,
        now: datetime | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Self:
        if not isinstance(tenant_id, uuid.UUID) or not isinstance(client_id, uuid.UUID):
            raise ValidationException(message="tenant_id and client_id must be valid UUIDs", code=400)

        trans = MCPTransport(transport) if isinstance(transport, str) else transport
        current_time = now or datetime.now(UTC)
        expiry = datetime.fromtimestamp(current_time.timestamp() + timeout_seconds, UTC)

        return cls(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            client_id=client_id,
            client_name=client_name.strip(),
            client_version=client_version.strip(),
            transport=trans,
            state=MCPSessionState.INITIALIZING,
            created_at=current_time,
            last_activity=current_time,
            expires_at=expiry,
            metadata=metadata or {},
        )

    def is_expired(self, now: datetime | None = None) -> bool:
        current_time = now or datetime.now(UTC)
        return current_time >= self.expires_at or self.state == MCPSessionState.EXPIRED

    def authenticate(self) -> MCPSession:
        if self.state not in (MCPSessionState.INITIALIZING, MCPSessionState.CONNECTED):
            raise ValidationException(message=f"Cannot authenticate session in state {self.state.value}", code=400)
        return replace(self, state=MCPSessionState.AUTHENTICATED)

    def activate(self) -> MCPSession:
        return replace(self, state=MCPSessionState.ACTIVE)

    def disconnect(self) -> MCPSession:
        return replace(self, state=MCPSessionState.DISCONNECTED)

    def touch(self, timeout_seconds: int = 1800, now: datetime | None = None) -> MCPSession:
        current_time = now or datetime.now(UTC)
        expiry = datetime.fromtimestamp(current_time.timestamp() + timeout_seconds, UTC)
        return replace(self, last_activity=current_time, expires_at=expiry)


__all__ = ["MCPClient", "MCPSession"]
