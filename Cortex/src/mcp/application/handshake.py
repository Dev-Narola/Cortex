"""
MCP Handshake Service for client initialization and version negotiation.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from src.core.config import settings
from src.mcp.application.registry import CapabilityRegistry
from src.mcp.application.session import MCPSessionService
from src.mcp.domain.entities import MCPSession
from src.mcp.domain.exceptions import UnsupportedProtocolVersion
from src.mcp.domain.value_objects import MCPProtocolVersion, MCPTransport

logger = logging.getLogger(__name__)


class MCPHandshakeService:
    """Service handling MCP protocol initialization handshake."""

    def __init__(
        self,
        db: Session,
        session_service: MCPSessionService | None = None,
        capability_registry: CapabilityRegistry | None = None,
    ) -> None:
        self._db = db
        self._session_service = session_service or MCPSessionService(db)
        self._capability_registry = capability_registry or CapabilityRegistry()

    async def initialize(
        self,
        *,
        tenant_id: uuid.UUID,
        protocol_version: str,
        client_name: str,
        client_version: str = "1.0.0",
        capabilities: dict[str, Any] | None = None,
        transport: MCPTransport | str = MCPTransport.WEBSOCKET,
    ) -> dict[str, Any]:
        """Perform MCP initialize handshake."""
        requested_ver = MCPProtocolVersion.parse(protocol_version)
        server_ver = MCPProtocolVersion.parse(settings.MCP_SERVER_VERSION)

        if not requested_ver.is_compatible_with(server_ver):
            raise UnsupportedProtocolVersion(
                message=f"Requested protocol version {protocol_version} is incompatible with server version {settings.MCP_SERVER_VERSION}",
                data={"requested": protocol_version, "supported": settings.MCP_SERVER_VERSION},
            )

        session = self._session_service.create_session(
            tenant_id=tenant_id,
            client_name=client_name,
            client_version=client_version,
            transport=transport,
            metadata={"requested_capabilities": capabilities or {}},
        )

        authenticated_session = session.authenticate().activate()
        self._session_service._session_repo.update(authenticated_session)
        self._db.commit()

        server_capabilities = self._capability_registry.resolve_capabilities()

        return {
            "protocolVersion": settings.MCP_SERVER_VERSION,
            "capabilities": server_capabilities,
            "serverInfo": {
                "name": settings.MCP_SERVER_NAME,
                "version": settings.MCP_SERVER_VERSION,
            },
            "sessionId": str(authenticated_session.id),
        }


__all__ = ["MCPHandshakeService"]
