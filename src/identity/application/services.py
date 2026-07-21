"""
Application services for the identity bounded context.

A service orchestrates one business use case end to end: it accepts
inputs (DTOs, primitives), coordinates the domain rules with the
infrastructure repositories, and returns a result. Services are the
only callers of repositories, and they own the transaction boundary
(`session.commit()` / `session.rollback()`).

The HTTP layer in `interface/rest/routes.py` calls into these
services; nothing else in the application should.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.orm import Session

from src.identity.domain.entities import ApiKey, Plan, Role, Tenant, User
from src.identity.infrastructure.repositories import (
    ApiKeyRepository,
    TenantRepository,
    UserRepository,
)
from src.identity.infrastructure.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    generate_api_key,
    hash_api_key,
    hash_password,
    jwt_default_expiry,
    verify_password,
)
from src.shared.exceptions import (
    ConflictException,
    NotFoundException,
    UnauthorizedException,
    ValidationException,
)

# ---------------------------------------------------------------------------
# DTOs (plain dataclasses; Pydantic models live in the interface layer)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RegisteredTenant:
    tenant: Tenant
    owner: User


@dataclass(frozen=True)
class IssuedToken:
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user: User
    tenant: Tenant


@dataclass(frozen=True)
class IssuedApiKey:
    """Returned exactly once at creation; the raw key is never
    recoverable after this object goes out of scope."""

    api_key: ApiKey
    raw_key: str


# ---------------------------------------------------------------------------
# RegisterTenantService
# ---------------------------------------------------------------------------


class RegisterTenantService:
    """
    Register a new tenant and its owner user in a single transaction.

    Flow:
        Validate input
            ↓
        Slug available
            ↓
        Create tenant
            ↓
        Create owner user
            ↓
        Commit
            ↓
        Return tenant + owner
    """

    def __init__(self, session: Session) -> None:
        self._session = session
        self._tenants = TenantRepository(session)
        self._users = UserRepository(session)

    def execute(
        self,
        *,
        tenant_name: str,
        tenant_slug: str,
        owner_email: str,
        owner_password: str,
        owner_full_name: str | None = None,
    ) -> RegisteredTenant:
        # 1. Validate
        if not owner_password or len(owner_password) < 8:
            raise ValidationException(
                message="Owner password must be at least 8 characters.",
                code=400,
                data={"field": "password", "min_length": 8},
            )

        # 2. Slug available (cheap in-process check before going to the DB)
        if self._tenants.exists(slug=tenant_slug):
            raise ConflictException(
                message=f"Tenant slug '{tenant_slug}' is already in use.",
                code=409,
                data={"field": "slug", "value": tenant_slug.lower()},
            )

        # 3. Create tenant
        tenant = Tenant.create(name=tenant_name, slug=tenant_slug)
        tenant = self._tenants.create(tenant)

        # 4. Create owner user
        owner = User.create(
            tenant_id=tenant.id,
            email=owner_email,
            hashed_password=hash_password(owner_password),
            role=Role.OWNER,
            full_name=owner_full_name,
        )
        owner = self._users.create(owner)

        # 5. Commit
        self._session.commit()

        # 6. Return
        return RegisteredTenant(tenant=tenant, owner=owner)


# ---------------------------------------------------------------------------
# AuthenticateUserService
# ---------------------------------------------------------------------------


class AuthenticateUserService:
    """
    Authenticate a user by tenant slug + email + password and issue
    a fresh access + refresh token pair.

    Flow:
        Find user
            ↓
        Verify password
            ↓
        Check `is_active`
            ↓
        Generate JWT
            ↓
        Update last_login
            ↓
        Return token + user + tenant
    """

    def __init__(self, session: Session) -> None:
        self._session = session
        self._tenants = TenantRepository(session)
        self._users = UserRepository(session)

    def execute(
        self,
        *,
        tenant_slug: str,
        email: str,
        password: str,
    ) -> IssuedToken:
        # 1. Find tenant by slug
        tenant = self._tenants.find_by_slug(tenant_slug)
        if tenant is None:
            # Don't reveal whether the tenant exists — return a
            # generic unauthorized so the caller can't enumerate
            # tenants.
            raise UnauthorizedException(
                message="Invalid credentials.",
                code=401,
            )

        # 2. Find user
        user = self._users.find_by_email(email, tenant_id=tenant.id)
        if user is None:
            raise UnauthorizedException(
                message="Invalid credentials.",
                code=401,
            )

        # 3. Verify password
        if not verify_password(password, user.hashed_password):
            raise UnauthorizedException(
                message="Invalid credentials.",
                code=401,
            )

        # 4. Check active
        user.assert_can_login()

        # 5. Generate tokens
        access = create_access_token(
            subject=str(user.id),
            extra_claims={
                "tenant_id": str(user.tenant_id),
                "role": user.role.value,
                "email": user.email,
            },
        )
        refresh = create_refresh_token(
            subject=str(user.id),
            extra_claims={"tenant_id": str(user.tenant_id)},
        )

        # 6. Update last_login + persist
        user.record_login()
        self._users.update(user)
        self._session.commit()

        return IssuedToken(
            access_token=access,
            refresh_token=refresh,
            token_type="bearer",
            expires_in=int(jwt_default_expiry().total_seconds()),
            user=user,
            tenant=tenant,
        )

    def refresh(self, *, refresh_token: str) -> IssuedToken:
        """Exchange a valid refresh token for a new token pair."""
        claims = decode_access_token(refresh_token, expected_type="refresh")
        try:
            user_id = uuid.UUID(str(claims["sub"]))
            tenant_id = uuid.UUID(str(claims["tenant_id"]))
        except (KeyError, ValueError) as exc:
            raise UnauthorizedException(
                message="Refresh token is missing required claims.",
                code=401,
                data={"field": "token"},
            ) from exc

        user = self._users.find_by_id(user_id, tenant_id=tenant_id)
        tenant = self._tenants.find_by_id(tenant_id)
        if user is None or tenant is None:
            raise UnauthorizedException(
                message="Refresh token references an unknown user or tenant.",
                code=401,
            )
        user.assert_can_login()

        access = create_access_token(
            subject=str(user.id),
            extra_claims={
                "tenant_id": str(user.tenant_id),
                "role": user.role.value,
                "email": user.email,
            },
        )
        new_refresh = create_refresh_token(
            subject=str(user.id),
            extra_claims={"tenant_id": str(user.tenant_id)},
        )
        return IssuedToken(
            access_token=access,
            refresh_token=new_refresh,
            token_type="bearer",
            expires_in=int(jwt_default_expiry().total_seconds()),
            user=user,
            tenant=tenant,
        )


# ---------------------------------------------------------------------------
# GetCurrentUserService
# ---------------------------------------------------------------------------


class GetCurrentUserService:
    """Resolve a (user, tenant) pair from a tenant_id + user_id pair
    (e.g. claims from a verified JWT)."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._tenants = TenantRepository(session)
        self._users = UserRepository(session)

    def execute(
        self, *, user_id: uuid.UUID, tenant_id: uuid.UUID
    ) -> tuple[User, Tenant]:
        user = self._users.find_by_id(user_id, tenant_id=tenant_id)
        if user is None:
            raise UnauthorizedException(
                message="Authenticated user no longer exists.",
                code=401,
            )
        tenant = self._tenants.find_by_id(tenant_id)
        if tenant is None:
            raise UnauthorizedException(
                message="Authenticated tenant no longer exists.",
                code=401,
            )
        if not user.is_active or not tenant.is_active:
            raise UnauthorizedException(
                message="Account is inactive.",
                code=401,
            )
        return user, tenant


# ---------------------------------------------------------------------------
# UpdateProfileService
# ---------------------------------------------------------------------------


class UpdateProfileService:
    """Update the current user's profile (full_name)."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._users = UserRepository(session)

    def execute(
        self,
        *,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        full_name: str | None = None,
    ) -> User:
        user = self._users.find_by_id(user_id, tenant_id=tenant_id)
        if user is None:
            raise NotFoundException(
                message="User not found.",
                code=404,
                data={"field": "id", "value": str(user_id)},
            )
        if full_name is not None:
            user.set_full_name(full_name)
        updated = self._users.update(user)
        self._session.commit()
        return updated


# ---------------------------------------------------------------------------
# CreateApiKeyService
# ---------------------------------------------------------------------------


class CreateApiKeyService:
    """
    Create a new API key for the given tenant.

    Flow:
        Generate raw key
            ↓
        Bcrypt-hash it
            ↓
        Save only the hash
            ↓
        Return raw key once
    """

    def __init__(self, session: Session) -> None:
        self._session = session
        self._api_keys = ApiKeyRepository(session)

    def execute(
        self,
        *,
        tenant_id: uuid.UUID,
        name: str,
        scopes: Sequence[str] | None = None,
    ) -> IssuedApiKey:
        raw_key = generate_api_key()
        api_key = ApiKey.create(
            tenant_id=tenant_id,
            name=name,
            key_hash=hash_api_key(raw_key),
            scopes=list(scopes) if scopes else [],
        )
        saved = self._api_keys.create(api_key)
        self._session.commit()
        return IssuedApiKey(api_key=saved, raw_key=raw_key)


# ---------------------------------------------------------------------------
# RevokeApiKeyService
# ---------------------------------------------------------------------------


class RevokeApiKeyService:
    """Revoke an API key. Idempotent — revoking an already-revoked
    key returns the same key without error."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._api_keys = ApiKeyRepository(session)

    def execute(
        self,
        *,
        api_key_id: uuid.UUID,
        tenant_id: uuid.UUID,
    ) -> ApiKey:
        key = self._api_keys.revoke(api_key_id, tenant_id=tenant_id)
        if key is None:
            raise NotFoundException(
                message="API key not found.",
                code=404,
                data={"field": "id", "value": str(api_key_id)},
            )
        self._session.commit()
        return key


# ---------------------------------------------------------------------------
# UpdateTenantService (helper for the PATCH /tenants/me endpoint)
# ---------------------------------------------------------------------------


class UpdateTenantService:
    """Update the current tenant's name / plan / settings."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._tenants = TenantRepository(session)

    def execute(
        self,
        *,
        tenant_id: uuid.UUID,
        name: str | None = None,
        plan: Plan | str | None = None,
        settings: dict | None = None,
    ) -> Tenant:
        tenant = self._tenants.find_by_id(tenant_id)
        if tenant is None:
            raise NotFoundException(
                message="Tenant not found.",
                code=404,
                data={"field": "id", "value": str(tenant_id)},
            )
        if name is not None:
            tenant.rename(name)
        if plan is not None:
            tenant.change_plan(plan)
        if settings is not None:
            tenant.update_settings(settings)
        updated = self._tenants.update(tenant)
        self._session.commit()
        return updated


__all__ = [
    "AuthenticateUserService",
    "CreateApiKeyService",
    "GetCurrentUserService",
    "IssuedApiKey",
    "IssuedToken",
    "RegisterTenantService",
    "RegisteredTenant",
    "RevokeApiKeyService",
    "UpdateProfileService",
    "UpdateTenantService",
]
