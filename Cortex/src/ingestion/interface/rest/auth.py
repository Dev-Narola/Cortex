"""
Authentication dependencies for the ingestion REST
routes.

The ingestion routes need to know two things from
the caller:

* **which tenant** the request is acting on
  (``tenant_id``, used for tenant-scoped DB queries)
* **who** the caller is (a real ``user_id``, used
  for the ``documents.created_by`` foreign key +
  the audit log)

The ingestion auth helpers return a
:class:`DocumentWriteAuth` that carries both so
the route handler can read the right field for the
right purpose. The previous version of this module
returned only the tenant id, which made the upload
route misattribute ``created_by = tenant_id`` and
blow up on the foreign key to ``users.id`` (the
V11 hot-fix).

The V11 redesign keeps the read path returning
``uuid.UUID`` (tenant id only — reads don't need
``created_by``) and the write path returning the
full :class:`DocumentWriteAuth` so the route
handler can use the right field for the right
purpose.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from src.identity.domain.entities import Role
from src.core.database import get_db
from src.core.dependencies import (
    _role_check,
    api_key_actor_user_id,
    get_current_user,
    require_api_key,
)


@dataclass(frozen=True, slots=True)
class DocumentWriteAuth:
    """The authenticated caller of a document route (read or write).

    * ``tenant_id``  - scope for every query.
    * ``created_by`` - the user recorded in ``documents.created_by``
      (the JWT user, or the API key issuer / tenant owner).
    * ``api_key_id`` - set for API-key callers (audit actor).
    """

    tenant_id: uuid.UUID
    created_by: uuid.UUID
    api_key_id: uuid.UUID | None = None

    @property
    def actor_user_id(self) -> uuid.UUID | None:
        """Audit actor when a human (JWT) made the call."""
        return None if self.api_key_id else self.created_by


DocumentAuth = DocumentWriteAuth


def require_document_read(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> DocumentWriteAuth:
    """``documents:read`` scope, or any tenant role (viewers may read, US-1)."""
    return _verify_ingestion_auth(
        required_scope="documents:read",
        min_role=Role.VIEWER,
        authorization=authorization,
        x_api_key=x_api_key,
        db=db,
    )


def require_document_write(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> DocumentWriteAuth:
    """``documents:write`` scope, or MEMBER+ (viewers cannot upload/delete, US-1)."""
    return _verify_ingestion_auth(
        required_scope="documents:write",
        min_role=Role.MEMBER,
        authorization=authorization,
        x_api_key=x_api_key,
        db=db,
    )


def _api_key_auth(ctx, required_scope: str, db: Session) -> DocumentWriteAuth:
    if required_scope not in ctx.api_key.scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"API Key missing required scope: {required_scope}",
        )
    created_by = api_key_actor_user_id(db, ctx)
    if created_by is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key has no attributable user (issuer and tenant owner missing).",
        )
    return DocumentWriteAuth(
        tenant_id=ctx.tenant.id, created_by=created_by, api_key_id=ctx.api_key.id
    )


def _verify_ingestion_auth(
    required_scope: str,
    min_role: Role,
    authorization: str | None,
    x_api_key: str | None,
    db: Session,
) -> DocumentWriteAuth:
    """JWT (role-checked) or API key (scope-checked) -> :class:`DocumentWriteAuth`."""
    if x_api_key:
        ctx = require_api_key(x_api_key=x_api_key, authorization=None, db=db)
        return _api_key_auth(ctx, required_scope, db)

    if authorization:
        parts = authorization.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1].strip()
            # JWTs have 3 dot-separated parts; anything else is an API key.
            if len(token.split(".")) == 3:
                user, tenant = get_current_user(authorization=authorization, db=db)
                _role_check((user, tenant), min_role=min_role)
                return DocumentWriteAuth(tenant_id=tenant.id, created_by=user.id)
            ctx = require_api_key(x_api_key=None, authorization=authorization, db=db)
            return _api_key_auth(ctx, required_scope, db)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
    )
