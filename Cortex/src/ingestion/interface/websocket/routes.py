"""
WebSocket route for document ingestion status streaming.

Endpoint: ``/ws/ingestion``.

Authentication: JWT bearer token or query parameter ``?token=...``.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.dependencies import _resolve_jwt_user, get_async_db
from src.shared.exceptions import UnauthorizedException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws/ingestion", tags=["websocket"])

_CLOSE_UNAUTHORIZED = 4401
_CLOSE_FORBIDDEN = 4403


async def _authenticate_ingestion_ws(
    websocket: WebSocket,
    db: AsyncSession,
) -> tuple[Any, Any] | None:
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
        user_tenant = await asyncio.to_thread(_resolve_jwt_user, token, db)
    except UnauthorizedException as exc:
        logger.info("Ingestion WebSocket auth failed: %s", exc.message)
        await websocket.close(code=_CLOSE_UNAUTHORIZED)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.exception("Ingestion WebSocket auth unexpected error: %s", exc)
        await websocket.close(code=_CLOSE_UNAUTHORIZED)
        return None

    return user_tenant


@router.websocket("")
@router.websocket("/")
async def ingestion_websocket_endpoint(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_async_db),
) -> None:
    await websocket.accept()

    user_tenant = await _authenticate_ingestion_ws(websocket, db)
    if user_tenant is None:
        return

    user, tenant = user_tenant
    logger.info("Ingestion WebSocket connected: tenant=%s user=%s", tenant.id, user.id)

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
