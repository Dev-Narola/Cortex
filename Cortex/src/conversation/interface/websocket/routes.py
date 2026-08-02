"""
WebSocket route for streaming RAG conversations.

Endpoint: ``/ws/conversations/{conversation_id}``.

Authentication: JWT bearer token, supplied either via the
``Authorization: Bearer …`` header (the standard for the rest of
the API) or via a ``?token=…`` query parameter. Query-param auth
is included because browser WebSocket APIs can't easily set
headers — both paths are accepted, both are validated through
the same ``_resolve_jwt_user`` path so neither is weaker than
the other.

Tenant isolation: the route refuses the connection (close code
``4403``) when the conversation does not belong to the
authenticated user's tenant, or when the user is not the
conversation's owner. There is no "share a conversation" path
in V3.

Protocol: see ``interface/websocket/handlers.py`` for the
envelope shapes. The flow on a successful message is:

    client → {"type": "message", "content": "…"}
    server → message_start
    server → token   (× N)
    server → citation (× M, in numerical order)
    server → message_complete
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.conversation.application.services import AnswerQueryService
from src.conversation.domain.entities import Citation, Message, MessageRole
from src.conversation.infrastructure.repositories import (
    ConversationMessageRepository,
    ConversationRepository,
)
from src.conversation.interface.websocket.handlers import (
    make_citation,
    make_error,
    make_message_complete,
    make_message_start,
    make_token,
    parse_client_message,
)
from src.core.dependencies import (
    get_answer_query_service_async,
    get_async_db,
    _resolve_jwt_user,
)
from src.shared.exceptions import UnauthorizedException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws/conversations", tags=["websocket"])

# WebSocket close codes that mean *the client's fault*. RFC 6455
# reserves 4000-4999 for application use; we pick 4401 / 4403 to
# mirror HTTP 401 / 403 semantics so logs and clients have a
# consistent vocabulary.
_CLOSE_UNAUTHORIZED = 4401
_CLOSE_FORBIDDEN = 4403
_CLOSE_BAD_REQUEST = 4400


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


async def _authenticate(
    websocket: WebSocket,
    db: AsyncSession,
) -> tuple[Any, Any] | None:
    """
    Validate the JWT from the request and resolve ``(user, tenant)``.

    Tries the ``Authorization: Bearer …`` header first, then a
    ``?token=…`` query parameter. Returns ``None`` after closing
    the connection on auth failure so the caller can early-return.
    """
    token: str | None = None
    auth = websocket.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth.split(None, 1)[1].strip()
    if not token:
        token = websocket.query_params.get("token")

    if not token:
        await websocket.close(code=_CLOSE_UNAUTHORIZED)
        return None

    try:
        # ``_resolve_jwt_user`` is sync (it talks to the sync
        # session via ``get_db``). We bridge through
        # ``asyncio.to_thread`` so the WebSocket loop doesn't
        # block. The DB hit is bounded (one user + one tenant
        # row) so the latency cost is negligible.
        user_tenant = await asyncio.to_thread(_resolve_jwt_user, token, db)
    except UnauthorizedException as exc:
        logger.info("WebSocket auth failed: %s", exc.message)
        await websocket.send_json(make_error("UNAUTHORIZED", exc.message))
        await websocket.close(code=_CLOSE_UNAUTHORIZED)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.exception("WebSocket auth unexpected error: %s", exc)
        await websocket.send_json(make_error("UNAUTHORIZED", "Authentication failed."))
        await websocket.close(code=_CLOSE_UNAUTHORIZED)
        return None

    return user_tenant


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.websocket("/{conversation_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_async_db),
) -> None:
    await websocket.accept()

    # 1) Authenticate.
    user_tenant = await _authenticate(websocket, db)
    if user_tenant is None:
        return
    user, tenant = user_tenant

    # 2) Tenant-isolated conversation load.
    conv_repo = ConversationRepository(db)
    conversation = await asyncio.to_thread(
        conv_repo.get_by_id, conversation_id, tenant_id=tenant.id
    )
    if conversation is None or conversation.user_id != user.id:
        await websocket.send_json(
            make_error("FORBIDDEN", "Conversation not found in this tenant.")
        )
        await websocket.close(code=_CLOSE_FORBIDDEN)
        return

    # 3) Build the per-connection RAG service. The factory wires
    #    the async DB session, embedding provider, and LLM.
    answer_service: AnswerQueryService = await get_answer_query_service_async(db)

    # 4) Message loop.
    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                raw = json.loads(raw_text)
            except json.JSONDecodeError:
                await websocket.send_json(
                    make_error("BAD_REQUEST", "Invalid JSON.")
                )
                await websocket.close(code=_CLOSE_BAD_REQUEST)
                return

            try:
                _, payload = parse_client_message(raw)
            except ValueError as exc:
                await websocket.send_json(
                    make_error("BAD_REQUEST", str(exc))
                )
                await websocket.close(code=_CLOSE_BAD_REQUEST)
                return

            content = payload["content"]
            await _handle_one_turn(
                websocket=websocket,
                db=db,
                answer_service=answer_service,
                conversation=conversation,
                user_content=content,
            )
    except WebSocketDisconnect:
        logger.info(
            "WebSocket disconnected: tenant=%s conversation=%s",
            tenant.id,
            conversation_id,
        )
        return


async def _handle_one_turn(
    *,
    websocket: WebSocket,
    db: AsyncSession,
    answer_service: AnswerQueryService,
    conversation: Any,
    user_content: str,
) -> None:
    """
    Handle a single user message: persist it, stream the assistant
    response, emit citations, persist the assistant message.

    Failures in any step emit an ``error`` envelope and return —
    the outer loop continues so the client can keep asking.
    """
    msg_repo = ConversationMessageRepository(db)
    user_message = Message.create(
        conversation_id=conversation.id,
        tenant_id=conversation.tenant_id,
        role=MessageRole.USER,
        content=user_content,
    )
    try:
        await asyncio.to_thread(msg_repo.append, user_message)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to persist user message: %s", exc)
        await websocket.send_json(
            make_error("PERSISTENCE_FAILED", "Could not save the user message.")
        )
        return

    assistant_id = uuid.uuid4()
    await websocket.send_json(make_message_start(assistant_id))

    collected_tokens: list[str] = []
    citations: list[Citation] = []
    generation_failed = False

    try:
        async for event in answer_service.stream_answer(
            tenant_id=conversation.tenant_id,
            conversation_id=conversation.id,
            user_id=conversation.user_id,
            query=user_content,
        ):
            kind = event.get("kind")
            if kind == "token":
                token = str(event.get("content", ""))
                if token:
                    collected_tokens.append(token)
                    await websocket.send_json(make_token(token))
            elif kind == "citation":
                citation = event.get("citation")
                if isinstance(citation, Citation):
                    citations.append(citation)
                    await websocket.send_json(
                        {
                            "type": "citation",
                            "citation": citation.to_dict(),
                        }
                    )
            # ``event`` may also be a plain token string (legacy
            # fallback). Treat that as a token.
            elif isinstance(event, str):
                if event:
                    collected_tokens.append(event)
                    await websocket.send_json(make_token(event))
            else:
                logger.debug("Ignoring unknown stream event: %r", event)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Generation failed: %s", exc)
        generation_failed = True
        try:
            await websocket.send_json(
                make_error("GENERATION_FAILED", str(exc))
            )
        except Exception:  # noqa: BLE001 - client may have disconnected mid-send
            pass

    if not generation_failed:
        full_content = "".join(collected_tokens)
        assistant_message = Message.create(
            conversation_id=conversation.id,
            tenant_id=conversation.tenant_id,
            role=MessageRole.ASSISTANT,
            content=full_content,
            token_count=_rough_token_count(full_content),
            retrieved_chunk_ids=[c.chunk_id for c in citations],
            model_name=answer_service.model_name,
        )
        try:
            await asyncio.to_thread(msg_repo.append, assistant_message)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Failed to persist assistant message: %s", exc)
            # We still send message_complete so the client knows
            # the turn ended; the assistant message will be
            # retried by a background reconciliation job (V4).

        # Re-emit citations in the canonical [1], [2] order so
        # the client can render the answer with inline markers
        # that point at exactly the right citation.
        for index, citation in enumerate(citations, start=1):
            await websocket.send_json(
                make_citation(
                    document_id=citation.document_id,
                    chunk_id=citation.chunk_id,
                    document_title=citation.document_title,
                    chunk_index=citation.chunk_index,
                    score=citation.score,
                    excerpt=citation.excerpt,
                )
            )

        await websocket.send_json(make_message_complete(assistant_id))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _rough_token_count(text: str) -> int:
    """
    Rough token estimate. 1 token ≈ 4 chars of English; good enough
    for a per-message cost hint. The proper tiktoken-based counter
    is used by ``ContextWindowManager`` for the model's actual
    context budget.
    """
    if not text:
        return 0
    return max(1, len(text) // 4)


__all__ = ["router"]
