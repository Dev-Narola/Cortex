"""
SQLAlchemy ORM models for the identity bounded context.

These models are the persistence-layer representation of the domain
entities in `domain/entities.py`. They live here (not in the domain
layer) so the domain stays free of SQLAlchemy imports.

The model classes intentionally use generic SQLAlchemy types (Uuid,
JSON, etc.) so the same schema works against both PostgreSQL (the
production target) and SQLite (the in-process test database). On
PostgreSQL, `Uuid` becomes a native UUID column and `JSON` becomes
JSONB-equivalent.

Table layout follows `Docs/database.md`:

* `tenants`         — root of every tenant-scoped row
* `users`           — belongs to a tenant; unique email per tenant
* `api_keys`        — belongs to a tenant; only the bcrypt hash is stored
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy import (
    Uuid as SAUuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.database import Base

# ---------------------------------------------------------------------------
# TenantModel
# ---------------------------------------------------------------------------


class TenantModel(Base):
    """ORM mapping for the `tenants` table."""

    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(63), nullable=False, unique=True)
    plan: Mapped[str] = mapped_column(String(32), nullable=False, default="free")
    settings: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    users: Mapped[list[UserModel]] = relationship(
        "UserModel",
        back_populates="tenant",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    api_keys: Mapped[list[ApiKeyModel]] = relationship(
        "ApiKeyModel",
        back_populates="tenant",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (Index("ix_tenants_slug", "slug", unique=True),)

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"TenantModel(id={self.id!r}, slug={self.slug!r})"


# ---------------------------------------------------------------------------
# UserModel
# ---------------------------------------------------------------------------


class UserModel(Base):
    """ORM mapping for the `users` table."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="member")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    tenant: Mapped[TenantModel] = relationship("TenantModel", back_populates="users")

    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),
        Index("ix_users_tenant_id", "tenant_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"UserModel(id={self.id!r}, email={self.email!r})"


# ---------------------------------------------------------------------------
# ApiKeyModel
# ---------------------------------------------------------------------------


class ApiKeyModel(Base):
    """ORM mapping for the `api_keys` table."""

    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    scopes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    tenant: Mapped[TenantModel] = relationship("TenantModel", back_populates="api_keys")

    __table_args__ = (
        Index("ix_api_keys_tenant_id", "tenant_id"),
        Index("ix_api_keys_tenant_key_hash", "tenant_id", "key_hash"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"ApiKeyModel(id={self.id!r}, name={self.name!r})"


__all__ = ["ApiKeyModel", "TenantModel", "UserModel"]
