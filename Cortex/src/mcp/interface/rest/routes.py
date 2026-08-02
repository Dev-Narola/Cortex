"""
MCP REST HTTP routes.

Exposes the MCP JSON-RPC 2.0 endpoint at ``/api/v1/mcp`` for
external AI clients that communicate over HTTP POST.

Authentication: API key (X-API-Key header) or JWT Bearer token.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from src.core.dependencies import get_db
from src.mcp.application.authentication import MCPAuthenticationService
from src.mcp.application.message_router import MCPMessageRouter
from src.mcp.domain.exceptions import MCPAuthenticationError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp", tags=["MCP"])


def _resolve_auth(
    request: Request,
    db: Session,
) -> tuple[Any, Any, str]:
    """Resolve (tenant_id, user_id, user_role) from request headers.

    Supports both API key and JWT authentication.
    """
    auth_service = MCPAuthenticationService(db)

    api_key = request.headers.get("x-api-key", "")
    authorization = request.headers.get("authorization", "")

    if api_key:
        return auth_service.authenticate_api_key(api_key)

    if authorization.lower().startswith("bearer "):
        token = authorization.split(None, 1)[1].strip()
        return auth_service.authenticate_jwt(token)

    raise MCPAuthenticationError(
        message="Missing authentication: provide X-API-Key or Authorization header"
    )


@router.post("")
async def mcp_json_rpc(
    request: Request,
    db: Session = Depends(get_db),
) -> JSONResponse:
    """HTTP POST JSON-RPC 2.0 endpoint for MCP communication."""
    try:
        tenant_id, user_id, user_role = _resolve_auth(request, db)
    except MCPAuthenticationError as exc:
        return JSONResponse(
            status_code=401,
            content={
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32001, "message": exc.message},
            },
        )

    body = await request.body()
    raw = body.decode("utf-8")

    message_router = MCPMessageRouter(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        user_role=user_role,
    )
    response_text = await message_router.handle_raw_message(raw)

    if not response_text:
        return JSONResponse(status_code=204, content=None)

    return JSONResponse(status_code=200, content=json.loads(response_text))


__all__ = ["router"]
