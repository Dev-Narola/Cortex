"""
SQLAlchemy ORM models for the conversation bounded context.

Two tables, both tenant-scoped:

* ``conversations``  — a chat thread owned by a single user inside
  a tenant. Holds the running ``summary`` that V3's
  ``ContextWindowManager`` maintains.
* ``conversation_messages`` — append-only messages inside a
  conversation. ``role`` is one of ``user`` / ``assistant`` /
  ``system``. ``retrieved_chunk_ids`` carries the citations the
  assistant used to ground its answer (denormalised JSONB array
  of chunk UUIDs) — the V3 RAG service writes this on the same
  transaction that persists the assistant message.

The migration that creates these tables lives at
``alembic/versions/d04887b3eb7e_create_conversation_tables.py``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy import Uuid as SAUuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.database import Base


# Recognised values for the ``role`` column. Mirrored in the domain
# entity and enforced at the database level via CHECK so a bug at any
# layer can't insert ``assistantt``.
_CONVERSATION_MESSAGE_ROLE_VALUES: tuple[str, ...] = (
    "user",
    "assistant",
    "system",
)


class ConversationModel(Base):
    """ORM mapping for the ``conversations`` table."""

    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    summary: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    messages: Mapped[list[ConversationMessageModel]] = relationship(
        "ConversationMessageModel",
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ConversationMessageModel.created_at",
    )

    __table_args__ = (
        # List "this tenant's conversations, most recently updated first".
        # Drives the dashboard's "Recent chats" list.
        Index(
            "ix_conversations_tenant_updated",
            "tenant_id",
            "updated_at",
        ),
        Index("ix_conversations_tenant_user", "tenant_id", "user_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"ConversationModel(id={self.id!r}, tenant_id={self.tenant_id!r}, "
            f"user_id={self.user_id!r}, title={self.title!r})"
        )


class ConversationMessageModel(Base):
    """ORM mapping for the ``conversation_messages`` table."""

    __tablename__ = "conversation_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # JSONB array of chunk UUIDs (as strings). Postgres-only; SQLite
    # stores the same value as TEXT under the JSONB dialect.
    retrieved_chunk_ids: Mapped[list[Any]] = mapped_column(
        JSONB().with_variant(String, "sqlite"),
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
    # The model used to produce the assistant message, when known.
    # Nullable because user/system messages don't have a model.
    model_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Cumulative cost estimate in USD, written at message persistence
    # time. Nullable so we can backfill later without breaking the
    # schema contract.
    cost_usd: Mapped[float | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    conversation: Mapped[ConversationModel] = relationship(
        "ConversationModel", back_populates="messages"
    )

    __table_args__ = (
        # Loading a conversation's history in order is the hot path
        # for context-window assembly; the composite index keeps it
        # cheap even with thousands of messages.
        Index(
            "ix_messages_conv_created",
            "conversation_id",
            "created_at",
        ),
        Index("ix_messages_tenant", "tenant_id"),
        CheckConstraint(
            f"role IN ({', '.join(repr(v) for v in _CONVERSATION_MESSAGE_ROLE_VALUES)})",
            name="ck_messages_role",
        ),
        CheckConstraint(
            "token_count >= 0",
            name="ck_messages_token_count_positive",
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"ConversationMessageModel(id={self.id!r}, "
            f"conversation_id={self.conversation_id!r}, role={self.role!r})"
        )


__all__ = ["ConversationMessageModel", "ConversationModel"]
