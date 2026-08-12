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

from src.identity.domain.entities import Role, Tenant
from src.core.database import get_db
from src.core.dependencies import (
    _role_check,
    get_current_user,
    require_api_key,
)


@dataclass(frozen=True, slots=True)
class DocumentWriteAuth:
    """Result of :func:`require_document_write`.

    Carries the ``tenant_id`` (for tenant-scoped
    queries) + the ``created_by`` UUID the
    ``documents.created_by`` column expects.

    * For JWT callers, ``created_by`` is the user's
      id (the audit log + the FK to ``users.id``
      both need a real user).
    * For API key callers, ``created_by`` falls
      back to ``api_key.user_id`` — every API key
      is bound to a user, so the FK is still
      satisfied. The ``api_key_id`` is also exposed
      so the audit log can record which key was
      used.
    """

    tenant_id: uuid.UUID
    created_by: uuid.UUID
    api_key_id: uuid.UUID | None = None


def require_document_read(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    """Dependency for ``documents:read`` scope or ``MEMBER`` role.

    Returns the **tenant id** (not the full
    :class:`DocumentWriteAuth`) because read paths
    only need tenant scope — ``created_by`` is
    irrelevant for reads.
    """
    return _verify_ingestion_auth(
        required_scope="documents:read",
        min_role=Role.MEMBER,
        authorization=authorization,
        x_api_key=x_api_key,
        db=db,
    ).tenant_id


def require_document_write(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> DocumentWriteAuth:
    """Dependency for ``documents:write`` scope or ``MEMBER`` role.

    Returns the full :class:`DocumentWriteAuth`
    (tenant id + the user id to record as
    ``created_by``). The route handler must use
    ``auth.tenant_id`` for tenant-scoped queries
    and ``auth.created_by`` for the
    ``documents.created_by`` column — the latter
    is a FK to ``users.id`` and was historically
    mis-set to ``tenant_id`` (which passed the
    type check but blew up the SQL INSERT).
    """
    return _verify_ingestion_auth(
        required_scope="documents:write",
        min_role=Role.MEMBER,
        authorization=authorization,
        x_api_key=x_api_key,
        db=db,
    )


def _verify_ingestion_auth(
    required_scope: str,
    min_role: Role,
    authorization: str | None,
    x_api_key: str | None,
    db: Session,
) -> DocumentWriteAuth:
    """Verify the caller's auth and return a
    :class:`DocumentWriteAuth`.

    The same function services both the read and
    write paths; the read dependency unwraps the
    ``tenant_id`` so existing callers don't have to
    change.
    """
    # 1. Try API Key if explicitly passed via header.
    if x_api_key:
        ctx = require_api_key(
            x_api_key=x_api_key, authorization=None, db=db
        )
        if required_scope not in ctx.api_key.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API Key missing required scope: {required_scope}",
            )
        # Every API key is bound to a user, so the
        # ``documents.created_by`` FK is satisfied.
        return DocumentWriteAuth(
            tenant_id=ctx.tenant.id,
            created_by=ctx.api_key.user_id,
            api_key_id=ctx.api_key.id,
        )

    # 2. If Authorization header is present, decide
    #    whether it's a JWT or an API key.
    if authorization:
        parts = authorization.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1].strip()
            # JWTs have 3 parts separated by dots.
            if len(token.split(".")) == 3:
                user, tenant = get_current_user(
                    authorization=authorization, db=db
                )
                _role_check((user, tenant), min_role=min_role)
                return DocumentWriteAuth(
                    tenant_id=tenant.id,
                    created_by=user.id,
                )
            # API Key passed as a Bearer token.
            ctx = require_api_key(
                x_api_key=None, authorization=authorization, db=db
            )
            if required_scope not in ctx.api_key.scopes:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"API Key missing required scope: {required_scope}",
                )
            return DocumentWriteAuth(
                tenant_id=ctx.tenant.id,
                created_by=ctx.api_key.user_id,
                api_key_id=ctx.api_key.id,
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
    )
