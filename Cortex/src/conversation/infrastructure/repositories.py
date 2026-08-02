"""
Repositories for the conversation bounded context.

* ``ConversationRepository`` — CRUD + listing for conversations.
* ``ConversationMessageRepository`` — append + ordered read for messages.

Both repositories accept an SQLAlchemy ``Session`` (sync) so they
can be used by the existing V2 ingestion/test infrastructure. Async
support is added at the FastAPI dependency layer (``get_async_db``)
where the V3 RAG / WebSocket paths live — those code paths call
``run_in_threadpool`` on the sync repo, which is fine because every
query is bounded by a single transaction.

Tenant isolation is enforced at the SQL level. Every method takes
a ``tenant_id`` and every WHERE clause includes it.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.conversation.domain.entities import Conversation, Message, MessageRole
from src.conversation.infrastructure.models import (
    ConversationMessageModel,
    ConversationModel,
)
from src.shared.exceptions import NotFoundException


# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------


def _as_utc(value: datetime) -> datetime:
    """
    Re-attach UTC tzinfo if a DB round-trip dropped it (SQLite does
    this; PostgreSQL preserves it).
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _conversation_to_model(c: Conversation) -> ConversationModel:
    return ConversationModel(
        id=c.id,
        tenant_id=c.tenant_id,
        user_id=c.user_id,
        title=c.title,
        summary=c.summary,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


def _model_to_conversation(m: ConversationModel) -> Conversation:
    return Conversation.from_persistence(
        id=m.id,
        tenant_id=m.tenant_id,
        user_id=m.user_id,
        title=m.title,
        summary=m.summary,
        created_at=_as_utc(m.created_at),
        updated_at=_as_utc(m.updated_at),
    )


def _message_to_model(msg: Message) -> ConversationMessageModel:
    return ConversationMessageModel(
        id=msg.id,
        conversation_id=msg.conversation_id,
        tenant_id=msg.tenant_id,
        role=msg.role.value if isinstance(msg.role, MessageRole) else str(msg.role),
        content=msg.content,
        token_count=msg.token_count,
        retrieved_chunk_ids=[str(c) for c in msg.retrieved_chunk_ids],
        model_name=msg.model_name,
        cost_usd=msg.cost_usd,
        created_at=msg.created_at,
    )


def _model_to_message(m: ConversationMessageModel) -> Message:
    raw_ids = m.retrieved_chunk_ids or []
    if isinstance(raw_ids, str):
        # SQLite falls back to a JSON-encoded string. The
        # ``with_variant`` call in models.py uses JSONB on
        # Postgres (which auto-deserialises) and String on SQLite
        # (which returns a string). We handle both.
        import json

        try:
            raw_ids = json.loads(raw_ids)
        except json.JSONDecodeError:
            raw_ids = []
    chunk_ids: list[uuid.UUID] = []
    for cid in raw_ids:
        try:
            chunk_ids.append(uuid.UUID(str(cid)))
        except (ValueError, TypeError):
            # Drop bogus entries — never trust the DB unconditionally.
            continue
    return Message.from_persistence(
        id=m.id,
        conversation_id=m.conversation_id,
        tenant_id=m.tenant_id,
        role=MessageRole(m.role),
        content=m.content,
        token_count=m.token_count,
        retrieved_chunk_ids=chunk_ids,
        model_name=m.model_name,
        cost_usd=m.cost_usd,
        created_at=_as_utc(m.created_at),
    )


# ---------------------------------------------------------------------------
# ConversationRepository
# ---------------------------------------------------------------------------


class ConversationRepository:
    """Persistence-layer operations for the ``conversations`` table."""

    def __init__(self, session: Session) -> None:
        self._session = session

    # ---- writes ----

    def create(self, conversation: Conversation) -> Conversation:
        model = _conversation_to_model(conversation)
        self._session.add(model)
        self._session.flush()
        return _model_to_conversation(model)

    def update(
        self,
        conversation: Conversation,
    ) -> Conversation:
        """
        Persist changes to an existing conversation.

        The ``tenant_id`` on the in-memory entity must match the
        DB row. We refuse to write a cross-tenant update.
        """
        model = self._session.get(ConversationModel, conversation.id)
        if model is None:
            raise NotFoundException(
                message=f"Conversation {conversation.id} does not exist.",
                code=404,
                data={"conversation_id": str(conversation.id)},
            )
        if model.tenant_id != conversation.tenant_id:
            raise NotFoundException(
                message="Conversation not found in this tenant.",
                code=404,
                data={"conversation_id": str(conversation.id)},
            )
        model.title = conversation.title
        model.summary = conversation.summary
        model.updated_at = conversation.updated_at
        self._session.flush()
        return _model_to_conversation(model)

    def delete(self, conversation_id: uuid.UUID, *, tenant_id: uuid.UUID) -> bool:
        model = self._session.get(ConversationModel, conversation_id)
        if model is None or model.tenant_id != tenant_id:
            return False
        self._session.delete(model)
        self._session.flush()
        return True

    # ---- reads ----

    def get_by_id(
        self,
        conversation_id: uuid.UUID,
        *,
        tenant_id: uuid.UUID,
    ) -> Conversation | None:
        model = self._session.get(ConversationModel, conversation_id)
        if model is None or model.tenant_id != tenant_id:
            return None
        return _model_to_conversation(model)

    def list(
        self,
        tenant_id: uuid.UUID,
        *,
        user_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[Conversation]:
        """
        List a tenant's conversations, newest ``updated_at`` first.

        ``user_id`` is an optional filter — when set, the list is
        restricted to that user. The V3 RAG service always passes
        the current user's id, so a user can only see their own
        conversations even though the table is shared at the
        tenant level.
        """
        stmt = (
            select(ConversationModel)
            .where(ConversationModel.tenant_id == tenant_id)
            .order_by(ConversationModel.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if user_id is not None:
            stmt = stmt.where(ConversationModel.user_id == user_id)
        models = self._session.execute(stmt).scalars().all()
        return [_model_to_conversation(m) for m in models]

    def count(self, tenant_id: uuid.UUID, *, user_id: uuid.UUID | None = None) -> int:
        stmt = select(ConversationModel.id).where(
            ConversationModel.tenant_id == tenant_id
        )
        if user_id is not None:
            stmt = stmt.where(ConversationModel.user_id == user_id)
        return len(self._session.execute(stmt).scalars().all())


# ---------------------------------------------------------------------------
# ConversationMessageRepository
# ---------------------------------------------------------------------------


class ConversationMessageRepository:
    """
    Append-only repository for messages.

    There is no ``update`` or ``delete`` on messages — a chat log
    is append-only by design. (A future "edit last message" feature
    would add a separate ``amend`` path that creates a new
    message and links the old one.)
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    def append(self, message: Message) -> Message:
        """
        Append a new message to a conversation.

        The caller is responsible for ensuring the conversation
        belongs to the same tenant as the message; this method
        enforces the tenant_id match defensively.
        """
        # Defensive: the parent conversation must be in the same
        # tenant as the message. We look it up here to surface a
        # clear error early, rather than letting the FK constraint
        # reject the insert.
        conversation = self._session.get(ConversationModel, message.conversation_id)
        if conversation is None or conversation.tenant_id != message.tenant_id:
            raise NotFoundException(
                message=(
                    f"Conversation {message.conversation_id} not found in this "
                    f"tenant; cannot append message."
                ),
                code=404,
                data={"conversation_id": str(message.conversation_id)},
            )
        model = _message_to_model(message)
        self._session.add(model)
        self._session.flush()
        # Bump the parent conversation's ``updated_at`` so the
        # dashboard's "Recent chats" list reorders correctly. The
        # ORM-level cascade doesn't cover this because it's a
        # derived update, not a row deletion.
        conversation.updated_at = datetime.now(UTC)
        self._session.flush()
        return _model_to_message(model)

    def list_for_conversation(
        self,
        conversation_id: uuid.UUID,
        *,
        tenant_id: uuid.UUID,
        limit: int = 200,
    ) -> Sequence[Message]:
        """
        Load the most recent ``limit`` messages for a conversation,
        oldest first (so callers can walk the timeline forward).

        Tenant scope is mandatory — there is no overload that
        omits it.
        """
        # Pull newest ``limit`` then reverse to chronological order.
        # The composite index ``(conversation_id, created_at)``
        # makes both the top-N and the reverse cheap.
        stmt = (
            select(ConversationMessageModel)
            .where(ConversationMessageModel.conversation_id == conversation_id)
            .where(ConversationMessageModel.tenant_id == tenant_id)
            .order_by(ConversationMessageModel.created_at.desc())
            .limit(limit)
        )
        models = list(self._session.execute(stmt).scalars().all())
        models.reverse()
        return [_model_to_message(m) for m in models]

    def count_tokens(self, conversation_id: uuid.UUID, *, tenant_id: uuid.UUID) -> int:
        """Sum of ``token_count`` over all messages in the conversation."""
        from sqlalchemy import func

        stmt = select(func.coalesce(func.sum(ConversationMessageModel.token_count), 0))
        stmt = stmt.where(ConversationMessageModel.conversation_id == conversation_id)
        stmt = stmt.where(ConversationMessageModel.tenant_id == tenant_id)
        return int(self._session.execute(stmt).scalar_one())


__all__ = [
    "ConversationMessageRepository",
    "ConversationRepository",
    "_conversation_to_model",
    "_message_to_model",
    "_model_to_conversation",
    "_model_to_message",
]


# Quiet the type checker about unused imports — these are
# re-exported for tests / debug paths.
_ = Any
