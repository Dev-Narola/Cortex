"""
MCP Authentication Service for validating API keys and JWT access tokens.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from src.mcp.domain.exceptions import MCPAuthenticationError
from src.shared.exceptions import UnauthorizedException

logger = logging.getLogger(__name__)


class MCPAuthenticationService:
    """Service validating external client credentials (API keys or JWT tokens)."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def authenticate_api_key(self, api_key: str) -> tuple[uuid.UUID, uuid.UUID | None, str]:
        """Validate an API key and return (tenant_id, actor_user_id, role).

        Uses the shared indexed resolver (revocation + inactive-tenant checks).
        The role is derived from the key's scopes, never from its issuer, so a
        key can't exceed what it was granted: ``documents:read`` is required,
        ``documents:write`` yields ``member``, nothing yields admin.
        """
        from src.core.dependencies import api_key_actor_user_id, require_api_key

        try:
            ctx = require_api_key(x_api_key=api_key, authorization=None, db=self._db)
        except UnauthorizedException as exc:
            raise MCPAuthenticationError(message="API key authentication failed") from exc
        if "documents:read" not in ctx.api_key.scopes:
            raise MCPAuthenticationError(message="API key lacks the documents:read scope")
        role = "member" if "documents:write" in ctx.api_key.scopes else "viewer"
        return ctx.tenant.id, api_key_actor_user_id(self._db, ctx), role

    def authenticate_jwt(self, token: str) -> tuple[uuid.UUID, uuid.UUID, str]:
        """Validate a JWT and return (tenant_id, user_id, role) from the DB, so a
        deactivated user or a changed role takes effect immediately."""
        from src.core.dependencies import _resolve_jwt_user

        try:
            user, tenant = _resolve_jwt_user(token, self._db)
        except UnauthorizedException as exc:
            raise MCPAuthenticationError(message="JWT authentication failed") from exc
        return tenant.id, user.id, user.role.value


__all__ = ["MCPAuthenticationService"]
