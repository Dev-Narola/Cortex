"""
WebSocket route for document ingestion status streaming.

Endpoint: ``/ws/ingestion``.

Authentication: JWT bearer token or query parameter ``?token=...``.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from src.core.dependencies import _resolve_jwt_user, get_db
from src.shared.exceptions import UnauthorizedException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws/ingestion", tags=["websocket"])

_CLOSE_UNAUTHORIZED = 4401
_CLOSE_FORBIDDEN = 4403


async def _resolve_token(websocket: WebSocket) -> str | None:
    """Extract the JWT from Authorization header or ?token= query param."""
    auth = websocket.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth.split(None, 1)[1].strip()
    return websocket.query_params.get("token")


@router.websocket("")
@router.websocket("/")
async def ingestion_websocket_endpoint(
    websocket: WebSocket,
    db: Session = Depends(get_db),
) -> None:
    # ----------------------------------------------------------------
    # Authenticate BEFORE accepting the WebSocket handshake.
    # Closing an unaccepted WebSocket sends an HTTP 403 response to
    # the browser instead of an open→close cycle.  This stops the
    # "Connecting → Offline → Connecting" flicker in the UI.
    # ----------------------------------------------------------------
    token = await _resolve_token(websocket)
    if not token:
        await websocket.close(code=_CLOSE_UNAUTHORIZED)
        return

    try:
        user_tenant = await asyncio.to_thread(_resolve_jwt_user, token, db)
    except UnauthorizedException as exc:
        logger.info("Ingestion WebSocket auth failed: %s", exc.message)
        await websocket.close(code=_CLOSE_UNAUTHORIZED)
        return
    except Exception as exc:  # noqa: BLE001
        logger.exception("Ingestion WebSocket auth unexpected error: %s", exc)
        await websocket.close(code=_CLOSE_UNAUTHORIZED)
        return

    # Auth passed — now accept the connection.
    await websocket.accept()
    user, tenant = user_tenant
    logger.info(
        "Ingestion WebSocket connected: tenant=%s user=%s",
        tenant.id,
        user.id,
    )

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        logger.info("Ingestion WebSocket disconnected: tenant=%s", tenant.id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Ingestion WebSocket error: %s", exc)


__all__ = ["router"]
