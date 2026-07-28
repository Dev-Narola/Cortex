import uuid

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from src.identity.domain.entities import Role, Tenant
from src.core.database import get_db
from src.core.dependencies import (
    _role_check,
    get_current_user,
    require_api_key,
)


def require_document_read(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    """Dependency for 'documents:read' scope or 'MEMBER' role."""
    return _verify_ingestion_auth(
        required_scope="documents:read",
        min_role=Role.MEMBER,
        authorization=authorization,
        x_api_key=x_api_key,
        db=db,
    ).id


def require_document_write(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    """Dependency for 'documents:write' scope or 'MEMBER' role."""
    return _verify_ingestion_auth(
        required_scope="documents:write",
        min_role=Role.MEMBER,
        authorization=authorization,
        x_api_key=x_api_key,
        db=db,
    ).id


def _verify_ingestion_auth(
    required_scope: str,
    min_role: Role,
    authorization: str | None,
    x_api_key: str | None,
    db: Session,
) -> Tenant:
    # 1. Try API Key if explicitly passed via header
    if x_api_key:
        ctx = require_api_key(x_api_key=x_api_key, authorization=None, db=db)
        if required_scope not in ctx.api_key.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API Key missing required scope: {required_scope}",
            )
        return ctx.tenant

    # 2. If Authorization header is present, determine if it's JWT or API Key
    if authorization:
        parts = authorization.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1].strip()
            # JWTs have 3 parts separated by dots
            if len(token.split(".")) == 3:
                # It's a JWT. Use the standard dependency
                user, tenant = get_current_user(authorization=authorization, db=db)
                _role_check((user, tenant), min_role=min_role)
                return tenant
            else:
                # It's an API Key passed as a Bearer token
                ctx = require_api_key(x_api_key=None, authorization=authorization, db=db)
                if required_scope not in ctx.api_key.scopes:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"API Key missing required scope: {required_scope}",
                    )
                return ctx.tenant

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
    )
