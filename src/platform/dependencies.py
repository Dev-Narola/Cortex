"""
Shared FastAPI dependencies.

Every cross-cutting auth/tenant context dependency lives here. Route
handlers across every bounded context import these, so a single
change to how the current user is resolved applies everywhere.

Two authentication modes are supported:

* JWT bearer token (interactive users) — `get_current_user`
* API key header (programmatic clients) — `require_api_key`

Each dependency raises a 401/403 with a structured error body
(via the shared exception types) when the caller is missing
or unauthorized.

Implementation note: the identity-specific imports are done lazily
inside each function. Doing them at module top level creates a
circular import (platform -> identity -> platform), because the
identity models depend on `src.platform.database`, which itself
triggers a load of `src.platform.__init__` and therefore of this
module.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from src.platform.config import settings
from src.platform.database import SessionLocal, get_db  # noqa: F401 — re-exported below
from src.platform.redis_client import get_redis as _get_redis_client
from src.shared.exceptions import (
    UnauthorizedException,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    from src.identity.domain.entities import ApiKey, Tenant


# ---------------------------------------------------------------------------
# DB / settings providers
# ---------------------------------------------------------------------------


def get_settings():
    """Dependency to get application settings."""
    return settings


def get_redis():
    """Backwards-compat dependency for the shared Redis client."""
    return _get_redis_client()


# `get_db` is imported from `src.platform.database` at the top of this
# module so the same callable is what `Depends(get_db)` references
# everywhere — including tests that override it via
# `app.dependency_overrides[get_db]`.
get_db_dependency = get_db


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise UnauthorizedException(
            message="Missing Authorization header.",
            code=401,
            data={"field": "Authorization"},
        )
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise UnauthorizedException(
            message="Authorization header must be of the form 'Bearer <token>'.",
            code=401,
            data={"field": "Authorization"},
        )
    return parts[1].strip()


@dataclass(frozen=True)
class ApiKeyContext:
    """Returned by `require_api_key` so route handlers can
    inspect the matched key (e.g. for scope checks)."""

    tenant: Tenant
    api_key: ApiKey


# ---------------------------------------------------------------------------
# Current user / tenant
# ---------------------------------------------------------------------------


def _resolve_jwt_user(token: str, db: Session):
    """Decode a JWT, then load the (user, tenant) it points at."""
    from src.identity.infrastructure.repositories import (
        TenantRepository,
        UserRepository,
    )
    from src.identity.infrastructure.security import decode_access_token

    claims = decode_access_token(token, expected_type="access")
    try:
        user_id = uuid.UUID(str(claims["sub"]))
        tenant_id = uuid.UUID(str(claims["tenant_id"]))
    except (KeyError, ValueError) as exc:
        raise UnauthorizedException(
            message="Token is missing required claims.",
            code=401,
            data={"field": "token"},
        ) from exc

    users = UserRepository(db)
    tenants = TenantRepository(db)
    user = users.find_by_id(user_id, tenant_id=tenant_id)
    tenant = tenants.find_by_id(tenant_id)
    if user is None or tenant is None:
        raise UnauthorizedException(
            message="Authenticated user or tenant no longer exists.",
            code=401,
        )
    if not user.is_active or not tenant.is_active:
        raise UnauthorizedException(
            message="Account is inactive.",
            code=401,
        )
    return user, tenant


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Resolve the current `(user, tenant)` from a JWT bearer token."""
    from src.identity.domain.entities import Tenant, User  # noqa: F401

    token = _bearer_token(authorization)
    return _resolve_jwt_user(token, db)


def get_current_tenant(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Return just the current tenant. Use this in endpoints that
    need tenant context but don't operate on a specific user."""
    _, tenant = get_current_user(authorization=authorization, db=db)
    return tenant


# ---------------------------------------------------------------------------
# Role-based dependencies
# ---------------------------------------------------------------------------


def _role_check(
    current,
    *,
    min_role,
):
    """Common role check used by the require_* dependencies below.

    Defined as a plain helper (not a FastAPI dependency) so the
    individual `require_*` deps stay first-class citizens that
    FastAPI can wire into route signatures.
    """
    user, tenant = current
    if not user.role.can_act_as(min_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": (
                    f"This action requires at least the "
                    f"'{min_role.value}' role."
                ),
                "code": 403,
                "data": {
                    "field": "role",
                    "required": min_role.value,
                    "actual": user.role.value,
                },
            },
        )
    return user, tenant


def require_owner(current=Depends(get_current_user)):
    """Allow only the OWNER role."""
    from src.identity.domain.entities import Role

    return _role_check(current, min_role=Role.OWNER)


def require_admin(current=Depends(get_current_user)):
    """Allow OWNER or ADMIN."""
    from src.identity.domain.entities import Role

    return _role_check(current, min_role=Role.ADMIN)


def require_member(current=Depends(get_current_user)):
    """Allow OWNER, ADMIN, or MEMBER (i.e. anyone but VIEWER)."""
    from src.identity.domain.entities import Role

    return _role_check(current, min_role=Role.MEMBER)


# ---------------------------------------------------------------------------
# API-key auth
# ---------------------------------------------------------------------------


def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> ApiKeyContext:
    """
    Authenticate via an API key.

    The key may be supplied via either the `X-API-Key` header or a
    `Bearer`-style `Authorization` header. Verification walks every
    API key in the (already-known) tenant and bcrypt-checks each
    one — there is no hash-based lookup, because bcrypt is not
    searchable. The walking cost is acceptable for a typical
    tenant (a handful of keys); for a tenant with thousands of
    keys, this should be replaced with a constant-time indexed
    scheme (e.g. a short SHA-256 fingerprint stored alongside the
    bcrypt hash).
    """
    from src.identity.infrastructure.repositories import (
        ApiKeyRepository,
        TenantRepository,
    )
    from src.identity.infrastructure.security import verify_api_key

    raw = x_api_key
    if not raw and authorization:
        parts = authorization.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            raw = parts[1].strip()
    if not raw:
        raise UnauthorizedException(
            message="API key is required (X-API-Key or Authorization: Bearer).",
            code=401,
            data={"field": "api_key"},
        )

    tenants = TenantRepository(db)
    api_keys = ApiKeyRepository(db)
    # Walk every tenant's active keys. A future optimization is to
    # store a short, non-secret fingerprint of the key alongside
    # the bcrypt hash so we can look up the tenant in O(1).
    tenant_list = tenants.list(limit=10_000, offset=0)
    for tenant in tenant_list:
        if not tenant.is_active:
            continue
        keys = api_keys.list(tenant.id, include_revoked=False, limit=10_000)
        for key in keys:
            if verify_api_key(raw, key.key_hash):
                key.record_usage()
                db.commit()
                return ApiKeyContext(tenant=tenant, api_key=key)
    raise UnauthorizedException(
        message="Invalid API key.",
        code=401,
        data={"field": "api_key"},
    )


__all__ = [
    "ApiKeyContext",
    "get_current_tenant",
    "get_current_user",
    "get_db",
    "get_db_dependency",
    "get_settings",
    "require_admin",
    "require_api_key",
    "require_member",
    "require_owner",
]
