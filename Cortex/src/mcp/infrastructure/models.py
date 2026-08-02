"""
SQLAlchemy ORM models for the Model Context Protocol (MCP) bounded context.

Tables:
* ``mcp_sessions`` — persistent record of active and historic client sessions.
* ``mcp_clients`` — persistent record of registered external AI client applications.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy import (
    Uuid as SAUuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base


class MCPSessionModel(Base):
    """DB table mapping for MCPSession domain entity."""

    __tablename__ = "mcp_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), nullable=False, index=True
    )
    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0.0")
    transport: Mapped[str] = mapped_column(String(50), nullable=False, default="websocket")
    state: Mapped[str] = mapped_column(String(50), nullable=False, default="initializing")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    last_activity: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    session_metadata: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_mcp_sessions_tenant_state", "tenant_id", "state"),
    )


class MCPClientModel(Base):
    """DB table mapping for MCPClient domain entity."""

    __tablename__ = "mcp_clients"

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_type: Mapped[str] = mapped_column(String(50), nullable=False, default="custom")
    version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0.0")
    allowed_capabilities: Mapped[dict] = mapped_column(JSON, nullable=False, default=list)
    allowed_tools: Mapped[dict] = mapped_column(JSON, nullable=False, default=list)
    allowed_resources: Mapped[dict] = mapped_column(JSON, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        Index("ix_mcp_clients_tenant_name", "tenant_id", "name", unique=True),
    )


__all__ = ["MCPClientModel", "MCPSessionModel"]
