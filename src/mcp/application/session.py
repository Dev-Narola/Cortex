"""
MCP Session Service for managing external client session lifecycles.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from src.mcp.domain.entities import MCPClient, MCPSession
from src.mcp.domain.exceptions import MCPSessionExpired
from src.mcp.domain.value_objects import MCPSessionState, MCPTransport
from src.mcp.infrastructure.repositories import MCPClientRepository, MCPSessionRepository

logger = logging.getLogger(__name__)


class MCPSessionService:
    """Service managing session creation, retrieval, activity updates, and expiration."""

    def __init__(self, db: Session, timeout_seconds: int = 1800) -> None:
        self._db = db
        self._session_repo = MCPSessionRepository(db)
        self._client_repo = MCPClientRepository(db)
        self._timeout_seconds = timeout_seconds

    def create_session(
        self,
        *,
        tenant_id: uuid.UUID,
        client_name: str,
        client_version: str = "1.0.0",
        transport: MCPTransport | str = MCPTransport.WEBSOCKET,
        metadata: dict[str, Any] | None = None,
    ) -> MCPSession:
        """Create or resolve an MCPClient and initialize a new MCPSession."""
        client = self._client_repo.get_by_name(tenant_id=tenant_id, name=client_name)
        if client is None:
            client = MCPClient.create(
                tenant_id=tenant_id,
                name=client_name,
                version=client_version,
            )
            self._client_repo.create(client)

        session = MCPSession.create(
            tenant_id=tenant_id,
            client_id=client.id,
            client_name=client.name,
            client_version=client.version,
            transport=transport,
            timeout_seconds=self._timeout_seconds,
            metadata=metadata,
        )
        self._session_repo.create(session)
        self._db.commit()
        return session

    def get_active_session(
        self, *, tenant_id: uuid.UUID, session_id: uuid.UUID
    ) -> MCPSession:
        """Retrieve a session and verify it has not expired."""
        session = self._session_repo.get(tenant_id=tenant_id, session_id=session_id)
        if session is None or session.is_expired():
            raise MCPSessionExpired(
                message=f"MCP session '{session_id}' is expired or does not exist",
                data={"session_id": str(session_id), "tenant_id": str(tenant_id)},
            )
        return session

    def refresh_session(
        self, *, tenant_id: uuid.UUID, session_id: uuid.UUID
    ) -> MCPSession:
        """Touch session to reset activity timestamp and extend expiration."""
        session = self.get_active_session(tenant_id=tenant_id, session_id=session_id)
        touched = session.touch(timeout_seconds=self._timeout_seconds)
        self._session_repo.update(touched)
        self._db.commit()
        return touched

    def disconnect_session(
        self, *, tenant_id: uuid.UUID, session_id: uuid.UUID
    ) -> MCPSession:
        """Mark a session as disconnected."""
        session = self._session_repo.get(tenant_id=tenant_id, session_id=session_id)
        if session is not None:
            disconnected = session.disconnect()
            self._session_repo.update(disconnected)
            self._db.commit()
            return disconnected
        raise MCPSessionExpired(message=f"Session '{session_id}' not found", data={"session_id": str(session_id)})


__all__ = ["MCPSessionService"]
