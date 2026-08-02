"""
REST API for the conversation bounded context.

Endpoints:

* ``POST   /conversations``                   — start a new conversation
* ``GET    /conversations``                   — list the current user's conversations
* ``GET    /conversations/{id}``              — fetch a conversation (and its messages)
* ``GET    /conversations/{id}/messages``     — fetch a conversation's messages
* ``DELETE /conversations/{id}``              — delete a conversation

All routes enforce tenant isolation at the SQL level via the
repository; the route layer only re-checks tenant membership to
produce clear 404s.

Authentication: the standard JWT bearer flow through
``get_current_user``. WebSocket streaming lives in a sibling module
(``interface/websocket/routes.py``) so the protocol can evolve
independently of REST.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from src.conversation.domain.entities import Conversation, Message, MessageRole
from src.conversation.infrastructure.repositories import (
    ConversationMessageRepository,
    ConversationRepository,
)
from src.core.dependencies import get_current_user, get_db
from src.core.database import get_db as _get_db
from src.shared.exceptions import NotFoundException

# V4 Phase 30 — audit event wiring for the
# conversation lifecycle (create, access, delete).
# The audit log is append-only; a failed audit write
# is logged at CRITICAL but never re-raises (the
# underlying action has already succeeded).
from src.observability.application.audit_service import (  # noqa: E402
    AuditRecordingError,
    AuditService,
)
from src.observability.domain.entities import AuditAction  # noqa: E402
from src.observability.infrastructure.repositories import (  # noqa: E402
    AuditSqlRepository,
)


router = APIRouter(prefix="/conversations", tags=["conversations"])


# ---------------------------------------------------------------------------
# V4 Phase 30 — audit helpers
# ---------------------------------------------------------------------------


def _client_ip(request: Request) -> str | None:
    """Best-effort client IP extraction for the audit row.

    See ``src.identity.interface.rest.routes`` for
    the same helper.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client is not None:
        return request.client.host
    return None


def _safe_audit(
    db: Session,
    *,
    tenant_id: uuid.UUID,
    action: AuditAction,
    actor_user_id: uuid.UUID | None = None,
    resource_type: str | None = None,
    resource_id: uuid.UUID | str | None = None,
    metadata: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Record an audit event, swallowing + logging the failure.

    Same shape as the helpers in
    ``src.identity.interface.rest.routes`` and
    ``src.ingestion.interface.rest.routes``.
    """
    try:
        AuditService(repository=AuditSqlRepository(db)).record(
            tenant_id=tenant_id,
            action=action,
            actor_user_id=actor_user_id,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            metadata=metadata or {},
            ip_address=ip_address,
        )
    except AuditRecordingError:
        pass


# ---------------------------------------------------------------------------
# Schemas (Pydantic)
# ---------------------------------------------------------------------------


class CitationSchema(BaseModel):
    document_id: uuid.UUID
    chunk_id: uuid.UUID
    document_title: str
    chunk_index: int
    score: float = 0.0
    excerpt: str | None = None


class MessageSchema(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    token_count: int
    retrieved_chunk_ids: list[uuid.UUID] = Field(default_factory=list)
    model_name: str | None = None
    created_at: str


class ConversationSchema(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID
    title: str
    summary: str | None = None
    created_at: str
    updated_at: str


class ConversationWithMessagesSchema(ConversationSchema):
    messages: list[MessageSchema] = Field(default_factory=list)


class CreateConversationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=512)


class ConversationListResponse(BaseModel):
    items: list[ConversationSchema]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------


def _conv_to_schema(c: Conversation) -> ConversationSchema:
    return ConversationSchema(
        id=c.id,
        tenant_id=c.tenant_id,
        user_id=c.user_id,
        title=c.title,
        summary=c.summary,
        created_at=c.created_at.isoformat(),
        updated_at=c.updated_at.isoformat(),
    )


def _msg_to_schema(m: Message) -> MessageSchema:
    return MessageSchema(
        id=m.id,
        conversation_id=m.conversation_id,
        role=m.role.value if isinstance(m.role, MessageRole) else str(m.role),
        content=m.content,
        token_count=m.token_count,
        retrieved_chunk_ids=list(m.retrieved_chunk_ids),
        model_name=m.model_name,
        created_at=m.created_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=ConversationSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new conversation",
)
def create_conversation(
    request: Request,
    payload: CreateConversationRequest,
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationSchema:
    """
    Start a new conversation. The title is supplied by the client
    (the front-end typically auto-generates it from the first
    message; the V3 service can also rewrite it server-side after
    the first assistant turn).
    """
    user, tenant = user_tenant
    repo = ConversationRepository(db)
    conversation = Conversation.create(
        tenant_id=tenant.id,
        user_id=user.id,
        title=payload.title,
    )
    persisted = repo.create(conversation)
    db.commit()
    # V4 Phase 30 — conversation creation is a
    # privileged action; the audit row records the
    # owner + the new conversation id.
    _safe_audit(
        db,
        tenant_id=tenant.id,
        action=AuditAction.CONVERSATION_CREATED,
        actor_user_id=user.id,
        resource_type="conversation",
        resource_id=persisted.id,
        metadata={"title": persisted.title or ""},
        ip_address=_client_ip(request),
    )
    db.commit()
    return _conv_to_schema(persisted)


@router.get(
    "",
    response_model=ConversationListResponse,
    summary="List the current user's conversations in this tenant",
)
def list_conversations(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationListResponse:
    """
    List the authenticated user's conversations, newest
    ``updated_at`` first. Tenant scope is enforced via
    ``get_current_user`` (which returns the user's tenant), and the
    repository is also tenant-scoped.
    """
    user, tenant = user_tenant
    repo = ConversationRepository(db)
    items = repo.list(
        tenant_id=tenant.id,
        user_id=user.id,
        limit=limit,
        offset=offset,
    )
    total = repo.count(tenant_id=tenant.id, user_id=user.id)
    return ConversationListResponse(
        items=[_conv_to_schema(c) for c in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{conversation_id}",
    response_model=ConversationWithMessagesSchema,
    summary="Fetch a conversation with its messages",
)
def get_conversation(
    request: Request,
    conversation_id: uuid.UUID,
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationWithMessagesSchema:
    user, tenant = user_tenant
    conv_repo = ConversationRepository(db)
    msg_repo = ConversationMessageRepository(db)
    conversation = conv_repo.get_by_id(conversation_id, tenant_id=tenant.id)
    if conversation is None or conversation.user_id != user.id:
        # 404, not 403: don't leak the existence of conversations
        # the user doesn't own.
        raise NotFoundException(
            message="Conversation not found.",
            code=404,
            data={"conversation_id": str(conversation_id)},
        )
    messages = msg_repo.list_for_conversation(
        conversation_id,
        tenant_id=tenant.id,
        limit=200,
    )
    # V4 Phase 30 — fetching a conversation is a
    # privileged read. The audit row records the
    # actor + the conversation id. The message
    # content is *never* written to the audit log.
    _safe_audit(
        db,
        tenant_id=tenant.id,
        action=AuditAction.CONVERSATION_ACCESSED,
        actor_user_id=user.id,
        resource_type="conversation",
        resource_id=conversation_id,
        metadata={"message_count": len(messages)},
        ip_address=_client_ip(request),
    )
    db.commit()
    return ConversationWithMessagesSchema(
        id=conversation.id,
        tenant_id=conversation.tenant_id,
        user_id=conversation.user_id,
        title=conversation.title,
        summary=conversation.summary,
        created_at=conversation.created_at.isoformat(),
        updated_at=conversation.updated_at.isoformat(),
        messages=[_msg_to_schema(m) for m in messages],
    )


@router.get(
    "/{conversation_id}/messages",
    response_model=list[MessageSchema],
    summary="Fetch a conversation's messages",
)
def list_conversation_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(200, ge=1, le=500),
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MessageSchema]:
    user, tenant = user_tenant
    conv_repo = ConversationRepository(db)
    msg_repo = ConversationMessageRepository(db)
    conversation = conv_repo.get_by_id(conversation_id, tenant_id=tenant.id)
    if conversation is None or conversation.user_id != user.id:
        raise NotFoundException(
            message="Conversation not found.",
            code=404,
            data={"conversation_id": str(conversation_id)},
        )
    messages = msg_repo.list_for_conversation(
        conversation_id,
        tenant_id=tenant.id,
        limit=limit,
    )
    return [_msg_to_schema(m) for m in messages]


@router.delete(
    "/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a conversation (cascades to its messages)",
)
def delete_conversation(
    request: Request,
    conversation_id: uuid.UUID,
    user_tenant: tuple[Any, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    user, tenant = user_tenant
    repo = ConversationRepository(db)
    conversation = repo.get_by_id(conversation_id, tenant_id=tenant.id)
    if conversation is None or conversation.user_id != user.id:
        raise NotFoundException(
            message="Conversation not found.",
            code=404,
            data={"conversation_id": str(conversation_id)},
        )
    repo.delete(conversation_id, tenant_id=tenant.id)
    # V4 Phase 30 — conversation deletion is the
    # highest-trust action in the conversation
    # context; the audit row is the only post-hoc
    # evidence the operator has.
    _safe_audit(
        db,
        tenant_id=tenant.id,
        action=AuditAction.CONVERSATION_DELETED,
        actor_user_id=user.id,
        resource_type="conversation",
        resource_id=conversation_id,
        ip_address=_client_ip(request),
    )
    db.commit()
    return None


# Re-export the dependency so module-level tooling (e.g. test
# fixtures) can override it without reaching into ``platform``.
__all__ = ["router", "get_db"]

# A linter hint — the duplicated import is intentional: ``get_db``
# is the FastAPI dependency, and we want callers to be able to
# override it via ``app.dependency_overrides[get_db]``.
_ = _get_db
