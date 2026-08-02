"""
MCP Authentication Service for validating API keys and JWT access tokens.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from src.identity.infrastructure.security import decode_access_token, verify_password
from src.identity.infrastructure.models import ApiKeyModel, UserModel, TenantModel
from src.mcp.domain.exceptions import MCPAuthenticationError

logger = logging.getLogger(__name__)


class MCPAuthenticationService:
    """Service validating external client credentials (API keys or JWT tokens)."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def authenticate_api_key(self, api_key: str) -> tuple[uuid.UUID, uuid.UUID, str]:
        """Validate an API key and return (tenant_id, user_id, user_role)."""
        if not api_key or not api_key.startswith("ctx_"):
            raise MCPAuthenticationError(message="Invalid or missing API key format")

        key_records = self._db.query(ApiKeyModel).filter(ApiKeyModel.is_active == True).all()
        matched_key = None

        for record in key_records:
            if verify_password(api_key, record.key_hash):
                matched_key = record
                break

        if matched_key is None:
            raise MCPAuthenticationError(message="API key authentication failed")

        user = self._db.query(UserModel).filter(UserModel.id == matched_key.user_id).first()
        if user is None or not user.is_active:
            raise MCPAuthenticationError(message="User associated with API key is inactive")

        return user.tenant_id, user.id, user.role

    def authenticate_jwt(self, token: str) -> tuple[uuid.UUID, uuid.UUID, str]:
        """Validate a JWT access token and return (tenant_id, user_id, user_role)."""
        try:
            payload = decode_access_token(token)
            user_id = uuid.UUID(payload["sub"])
            tenant_id = uuid.UUID(payload["tenant_id"])
            role = payload.get("role", "member")
            return tenant_id, user_id, role
        except Exception as exc:
            raise MCPAuthenticationError(message=f"JWT authentication failed: {exc}")


__all__ = ["MCPAuthenticationService"]
