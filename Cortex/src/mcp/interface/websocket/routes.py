"""
MCP WebSocket routes.

Exposes a persistent WebSocket endpoint at ``/ws/mcp`` for
bidirectional JSON-RPC 2.0 communication with external AI clients.

Authentication: first message must be a valid ``initialize``
handshake containing credentials, or the connection is closed.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from src.core.dependencies import get_db
from src.mcp.application.authentication import MCPAuthenticationService
from src.mcp.application.message_router import MCPMessageRouter
from src.mcp.domain.exceptions import MCPAuthenticationError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["MCP WebSocket"])


@router.websocket("/ws/mcp")
async def mcp_websocket_endpoint(
    websocket: WebSocket,
    db: Session = Depends(get_db),
) -> None:
    """WebSocket endpoint for persistent MCP sessions.

    Authentication is resolved from the WebSocket handshake headers
    (X-API-Key or Authorization: Bearer). If neither is present the
    connection is rejected immediately.
    """
    await websocket.accept()

    auth_service = MCPAuthenticationService(db)
    api_key = websocket.headers.get("x-api-key", "")
    authorization = websocket.headers.get("authorization", "")

    try:
        if api_key:
            tenant_id, user_id, user_role = auth_service.authenticate_api_key(api_key)
        elif authorization.lower().startswith("bearer "):
            token = authorization.split(None, 1)[1].strip()
            tenant_id, user_id, user_role = auth_service.authenticate_jwt(token)
        else:
            await websocket.send_json(
                {"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": "Missing authentication"}}
            )
            await websocket.close(code=1008)
            return
    except MCPAuthenticationError as exc:
        await websocket.send_json(
            {"jsonrpc": "2.0", "id": None, "error": {"code": -32001, "message": exc.message}}
        )
        await websocket.close(code=1008)
        return

    message_router = MCPMessageRouter(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        user_role=user_role,
    )

    try:
        while True:
            raw = await websocket.receive_text()
            response_text = await message_router.handle_raw_message(raw)
            if response_text:
                await websocket.send_text(response_text)
    except WebSocketDisconnect:
        logger.info("mcp.websocket_disconnected tenant_id=%s", tenant_id)
    except Exception:
        logger.exception("mcp.websocket_error tenant_id=%s", tenant_id)
        await websocket.close(code=1011)


__all__ = ["router"]
