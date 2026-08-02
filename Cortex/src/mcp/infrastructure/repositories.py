"""
SQLAlchemy Repositories for MCP Session and Client aggregates.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any
from sqlalchemy.orm import Session

from src.mcp.domain.entities import MCPClient, MCPSession
from src.mcp.domain.value_objects import (
    MCPCapability,
    MCPClientType,
    MCPSessionState,
    MCPTransport,
)
from src.mcp.infrastructure.models import MCPClientModel, MCPSessionModel


class MCPSessionRepository:
    """Repository managing MCPSession persistence."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, session: MCPSession) -> MCPSession:
        model = MCPSessionModel(
            id=session.id,
            tenant_id=session.tenant_id,
            client_id=session.client_id,
            client_name=session.client_name,
            client_version=session.client_version,
            transport=session.transport.value,
            state=session.state.value,
            created_at=session.created_at,
            last_activity=session.last_activity,
            expires_at=session.expires_at,
            session_metadata=session.metadata,
        )
        self._db.add(model)
        self._db.flush()
        return session

    def get(self, *, tenant_id: uuid.UUID, session_id: uuid.UUID) -> MCPSession | None:
        model = (
            self._db.query(MCPSessionModel)
            .filter(
                MCPSessionModel.tenant_id == tenant_id,
                MCPSessionModel.id == session_id,
            )
            .first()
        )
        if model is None:
            return None

        def _to_utc(dt: datetime) -> datetime:
            if dt is not None and dt.tzinfo is None:
                return dt.replace(tzinfo=UTC)
            return dt

        return MCPSession(
            id=model.id,
            tenant_id=model.tenant_id,
            client_id=model.client_id,
            client_name=model.client_name,
            client_version=model.client_version,
            transport=MCPTransport(model.transport),
            state=MCPSessionState(model.state),
            created_at=_to_utc(model.created_at),
            last_activity=_to_utc(model.last_activity),
            expires_at=_to_utc(model.expires_at),
            metadata=model.session_metadata or {},
        )

    def update(self, session: MCPSession) -> MCPSession:
        model = (
            self._db.query(MCPSessionModel)
            .filter(
                MCPSessionModel.tenant_id == session.tenant_id,
                MCPSessionModel.id == session.id,
            )
            .first()
        )
        if model is not None:
            model.state = session.state.value
            model.last_activity = session.last_activity
            model.expires_at = session.expires_at
            model.session_metadata = session.metadata
            self._db.flush()
        return session


class MCPClientRepository:
    """Repository managing MCPClient persistence."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, client: MCPClient) -> MCPClient:
        model = MCPClientModel(
            id=client.id,
            tenant_id=client.tenant_id,
            name=client.name,
            client_type=client.client_type.value,
            version=client.version,
            allowed_capabilities=[c.value for c in client.allowed_capabilities],
            allowed_tools=list(client.allowed_tools),
            allowed_resources=list(client.allowed_resources),
            is_active=client.is_active,
            created_at=client.created_at,
            updated_at=client.updated_at,
        )
        self._db.add(model)
        self._db.flush()
        return client

    def get(self, *, tenant_id: uuid.UUID, client_id: uuid.UUID) -> MCPClient | None:
        model = (
            self._db.query(MCPClientModel)
            .filter(
                MCPClientModel.tenant_id == tenant_id,
                MCPClientModel.id == client_id,
            )
            .first()
        )
        if model is None:
            return None

        return MCPClient(
            id=model.id,
            tenant_id=model.tenant_id,
            name=model.name,
            client_type=MCPClientType(model.client_type),
            version=model.version,
            allowed_capabilities=tuple(
                MCPCapability(c) for c in (model.allowed_capabilities or [])
            ),
            allowed_tools=tuple(model.allowed_tools or []),
            allowed_resources=tuple(model.allowed_resources or []),
            is_active=model.is_active,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    def get_by_name(self, *, tenant_id: uuid.UUID, name: str) -> MCPClient | None:
        model = (
            self._db.query(MCPClientModel)
            .filter(
                MCPClientModel.tenant_id == tenant_id,
                MCPClientModel.name == name,
            )
            .first()
        )
        if model is None:
            return None

        return MCPClient(
            id=model.id,
            tenant_id=model.tenant_id,
            name=model.name,
            client_type=MCPClientType(model.client_type),
            version=model.version,
            allowed_capabilities=tuple(
                MCPCapability(c) for c in (model.allowed_capabilities or [])
            ),
            allowed_tools=tuple(model.allowed_tools or []),
            allowed_resources=tuple(model.allowed_resources or []),
            is_active=model.is_active,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )


__all__ = ["MCPClientRepository", "MCPSessionRepository"]
