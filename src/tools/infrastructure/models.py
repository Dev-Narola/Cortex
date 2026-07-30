"""
SQLAlchemy ORM models for the tools bounded context.

Stores the *description* of each tool — its name, the
JSON Schema the LLM is shown, the handler class name, and
the permissions. The handler instance itself lives in
process memory, registered at boot, and is not persisted.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy import Uuid as SAUuid
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base


class ToolModel(Base):
    """ORM mapping for the ``tools`` table."""

    __tablename__ = "tools"

    # ----- identity ---------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ----- content ----------------------------------------------------------

    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(String(2000), nullable=False)
    # JSON Schema document. JSON on PostgreSQL / TEXT on SQLite.
    schema_: Mapped[dict] = mapped_column("schema", JSON, nullable=False, default=dict)
    # Handler class name (or fully-qualified dotted path). The
    # registry looks the live implementation up by this name
    # at execution time; a misconfigured name surfaces as a
    # ``ToolNotFound`` error to the LLM.
    handler: Mapped[str] = mapped_column(String(255), nullable=False)
    # Lifecycle state.
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="active", index=True
    )
    # Permission list — tool names this tool is allowed to
    # chain to. JSON array. ``null`` means "any tool" (use
    # sparingly). Empty array means "no chained tools".
    permissions: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # ----- timestamps -------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # ----- indexes / constraints --------------------------------------------

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_tools_tenant_id_name"),
        Index("ix_tools_tenant_id_status", "tenant_id", "status"),
    )


__all__ = ["ToolModel"]
