"""
SQLAlchemy ORM models for the observability bounded context.

V4 Phase 15 — the audit log table.

* Single table, ``audit_log`` — matches the V3 forward
  declaration in ``Docs/database.md``.
* The table is **append-only** by application contract.
  The model has no ``updated_at`` column, and the
  repository (in :mod:`src.observability.infrastructure.repositories`)
  exposes only ``append()`` and ``list_for_tenant()``.
  Adding an ``UPDATE`` or ``DELETE`` would require
  adding a method to the :class:`AuditRepository` port
  — a deliberate (reviewable) change.
* Indexes:

  * ``(tenant_id, created_at)`` — the per-tenant audit
    feed, newest first. The admin route's
    ``GET /audit-log`` reads by this.
  * ``(tenant_id, action, created_at)`` —
    "what login failures did tenant X have in period Y?"
  * ``(tenant_id, actor_user_id, created_at)`` —
    "what did user Z do in tenant X?"

* The CHECK constraints enforce:

  * ``tenant_id NOT NULL`` — there is no global audit row.
  * ``action IN (...)`` — closed set, defence in depth
    against a typo leaking into the database.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Index,
    String,
    types as sa_types,
)
from sqlalchemy import Uuid as SAUuid
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base


# Cross-dialect JSON column. SQLAlchemy's ``JSON`` type
# renders as ``JSON`` on SQLite / MySQL and as ``JSONB`` on
# Postgres automatically, so the model is portable
# across the unit-test SQLite in-memory DB and the
# production Postgres target. The application reads /
# writes the value as a Python ``dict`` either way.
JSONType = sa_types.JSON



# Closed set of allowed actions. Mirrored in the
# application layer (``AuditAction`` enum) and enforced
# in the entity (``__post_init__``). The DB CHECK is
# the last line of defence.
_ALLOWED_ACTIONS: tuple[str, ...] = (
    "document_created",
    "document_accessed",
    "document_deleted",
    "document_ingestion_started",
    "document_ingestion_completed",
    "document_ingestion_failed",
    "api_key_created",
    "api_key_revoked",
    "tenant_created",
    "tenant_updated",
    "user_invited",
    "user_updated",
    "user_removed",
    "role_changed",
    "conversation_created",
    "conversation_accessed",
    "conversation_deleted",
    "login_success",
    "login_failure",
    "logout",
)

_ALLOWED_RESOURCE_TYPES: tuple[str, ...] = (
    "document",
    "chunk",
    "api_key",
    "tenant",
    "user",
    "role",
    "conversation",
    "message",
    "session",
)


class AuditLogModel(Base):
    """ORM mapping for the ``audit_log`` table."""

    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), nullable=False
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        SAUuid(as_uuid=True), nullable=True
    )
    actor_api_key_id: Mapped[uuid.UUID | None] = mapped_column(
        SAUuid(as_uuid=True), nullable=True
    )
    resource_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # ``metadata`` is a free-form JSON object. We use
    # the cross-dialect ``JSON`` type (renders as
    # ``JSONB`` on Postgres, ``JSON`` on SQLite/MySQL)
    # so the model is portable across the unit-test
    # SQLite in-memory DB and the production Postgres
    # target. Future work can do JSONB-specific queries
    # (``WHERE metadata->>'source_ip' = ...``) on the
    # Postgres side without changing the model.
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSONType, nullable=False, default=dict
    )
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    __table_args__ = (
        # Per-tenant audit feed (the admin route's hot path).
        Index(
            "ix_audit_log_tenant_created",
            "tenant_id",
            "created_at",
        ),
        # "What login failures did tenant X have in
        #  period Y?" — composite for action-scoped queries.
        Index(
            "ix_audit_log_tenant_action_created",
            "tenant_id",
            "action",
            "created_at",
        ),
        # "What did user Z do in tenant X?" — composite
        # for actor-scoped queries.
        Index(
            "ix_audit_log_tenant_actor_created",
            "tenant_id",
            "actor_user_id",
            "created_at",
        ),
        CheckConstraint(
            f"action IN ({', '.join(repr(a) for a in _ALLOWED_ACTIONS)})",
            name="ck_audit_log_action",
        ),
        CheckConstraint(
            "resource_type IS NULL OR "
            f"resource_type IN ({', '.join(repr(r) for r in _ALLOWED_RESOURCE_TYPES)})",
            name="ck_audit_log_resource_type",
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"AuditLogModel(id={self.id!r}, tenant_id={self.tenant_id!r}, "
            f"action={self.action!r}, actor_user_id={self.actor_user_id!r}, "
            f"resource_id={self.resource_id!r}, created_at={self.created_at!r})"
        )


__all__ = ["AuditLogModel"]
