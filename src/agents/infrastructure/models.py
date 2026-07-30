"""
SQLAlchemy ORM models for the agents bounded context.

The model classes intentionally use generic SQLAlchemy types
(``Uuid``, ``JSON``, ``String``, ``DateTime(timezone=True)``) so
the same schema works against both PostgreSQL (the production
target) and SQLite (the in-process test database). On PostgreSQL,
``Uuid`` becomes a native UUID column and ``JSON`` becomes the
``JSON`` type — close enough to JSONB for our purposes (the
``configuration`` payload is read and written whole; we never
query into it).

This module is the *only* place in the agents context that
imports from SQLAlchemy. The domain layer stays free of ORM
concerns, and the repository layer is the only consumer.

Schema layout
-------------

``agents``
    One row per agent definition. The full configuration lives
    in the ``configuration`` JSON column so a future field
    addition (e.g. ``memory_window``) does not require a
    migration.

Indexes:

* ``ix_agents_tenant_id`` — every query is tenant-scoped; the
  index makes the per-tenant listing constant time even for
  large fleets.
* ``ix_agents_status`` — used by the executor to count active
  agents per tenant and by the UI to filter by status.
* ``ix_agents_name`` — used to enforce the (tenant_id, name)
  uniqueness at the database layer.
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.database import Base


class AgentModel(Base):
    """ORM mapping for the ``agents`` table."""

    __tablename__ = "agents"

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

    # Display name. Required, non-empty (enforced in the domain
    # layer). Unique per tenant — the unique constraint is
    # declared at the bottom of the class.
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(
        String(2000), nullable=False, default=""
    )
    # The system prompt sent to the LLM. Required, non-empty
    # (enforced in the domain layer). Stored as ``text`` in
    # production; SQLAlchemy's ``String`` with no length
    # maps to ``text`` on PostgreSQL.
    system_prompt: Mapped[str] = mapped_column(String, nullable=False)
    # The model identifier (e.g. ``"gpt-4o-mini"``). Resolved by
    # the LLM provider factory at execution time.
    model: Mapped[str] = mapped_column(String(255), nullable=False)

    # ----- lifecycle --------------------------------------------------------

    # Lifecycle state. Stored as a string so a future status
    # added on the enum does not require a column type change
    # in production (just an alembic data migration if the
    # existing rows need a default).
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="active", index=True
    )

    # The full configuration. ``JSON`` maps to ``jsonb`` on
    # PostgreSQL (the closest portable match) and to a TEXT
    # column on SQLite. The repository round-trips the value
    # through ``AgentConfiguration.to_dict`` /
    # ``AgentConfiguration.from_dict``.
    configuration: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Soft delete. ``NULL`` means the row is live; a timestamp
    # means the agent was archived. The repository's
    # ``list/get`` queries filter ``deleted_at IS NULL`` so a
    # deleted agent disappears from API responses while its
    # historical run rows (which have a foreign key to
    # ``agents.id``) remain referentially intact.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ----- timestamps -------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # ----- indexes / constraints --------------------------------------------

    __table_args__ = (
        # (tenant_id, name) is the natural lookup key. The
        # uniqueness is what the repository relies on for the
        # "agent name already exists" check.
        UniqueConstraint(
            "tenant_id",
            "name",
            name="uq_agents_tenant_id_name",
        ),
        # A composite index on (tenant_id, deleted_at) makes the
        # "list this tenant's live agents" query a single index
        # range scan.
        Index("ix_agents_tenant_id_deleted_at", "tenant_id", "deleted_at"),
    )


__all__ = ["AgentModel"]
