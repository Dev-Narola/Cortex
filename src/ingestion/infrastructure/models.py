"""
SQLAlchemy ORM models for the ingestion bounded context.

These models are the persistence-layer representation of the
domain entities in `domain/entities.py`. They live here (not in
the domain layer) so the domain stays free of SQLAlchemy imports.

The model classes intentionally use generic SQLAlchemy types
(`Uuid`, `String`, `Integer`, …) so the same schema works against
both PostgreSQL (the production target) and SQLite (the in-process
test database). On PostgreSQL, `Uuid` becomes a native UUID column.

Table layout follows `Docs/database.md`:

* `documents` — a tenant-scoped record of a file uploaded into the
  system, with a pointer to the raw bytes in S3 (`storage_uri`).
  The database never stores the file bytes themselves.

This module is intentionally narrow in scope. `document_chunks`,
`kg_entities`, and `kg_relations` are out of V1 and live in their
own migrations/models when they arrive.
"""

from __future__ import annotations

import uuid

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy import (
    Uuid as SAUuid,
)
from sqlalchemy import (
    DateTime,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.identity.infrastructure.models import TenantModel, UserModel
from src.platform.database import Base

# ---------------------------------------------------------------------------
# DocumentModel
# ---------------------------------------------------------------------------


# The set of values allowed in the `status` and `source_type` columns.
# Mirrored in the domain enum (`DocumentStatus`, `SourceType`) and
# enforced at the database level via CHECK constraints so a bug at
# any layer can't insert a row with a typo'd status.
_DOCUMENT_STATUS_VALUES = (
    "pending",
    "parsing",
    "chunking",
    "embedding",
    "indexed",
    "failed",
)
_SOURCE_TYPE_VALUES = ("upload", "url", "api")


class DocumentModel(Base):
    """ORM mapping for the `documents` table."""

    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="upload"
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_uri: Mapped[str | None] = mapped_column(
        String(1024), nullable=True
    )
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending"
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Convenience relationships. The relationship to `Tenant` and
    # `User` is intentionally one-directional here — we never query
    # "all documents for a tenant" via this relationship in the
    # V1 upload flow; the repository is the only thing that knows
    # how to issue tenant-scoped queries safely.
    tenant: Mapped[TenantModel] = relationship("TenantModel")
    created_by_user: Mapped[UserModel] = relationship("UserModel")

    __table_args__ = (
        # Tenant-scoped pagination: the most common list query is
        # "give me this tenant's documents, newest first".
        Index(
            "ix_documents_tenant_id_created_at",
            "tenant_id",
            "created_at",
        ),
        # Worker polling: V2 will query
        #   SELECT ... WHERE status != 'indexed'
        # repeatedly. A partial index keeps that scan small even
        # when a tenant has many completed documents.
        Index(
            "ix_documents_pending_status",
            "status",
            postgresql_where=text("status != 'indexed'"),
            sqlite_where=text("status != 'indexed'"),
        ),
        # Defensive: enforce the enum-like columns at the DB level
        # so a bug in any layer can't insert a typo'd value.
        CheckConstraint(
            f"status IN ({', '.join(repr(v) for v in _DOCUMENT_STATUS_VALUES)})",
            name="ck_documents_status",
        ),
        CheckConstraint(
            f"source_type IN ({', '.join(repr(v) for v in _SOURCE_TYPE_VALUES)})",
            name="ck_documents_source_type",
        ),
        CheckConstraint(
            "version >= 1",
            name="ck_documents_version_positive",
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"DocumentModel(id={self.id!r}, tenant_id={self.tenant_id!r}, "
            f"title={self.title!r}, status={self.status!r})"
        )


__all__ = ["DocumentModel"]
