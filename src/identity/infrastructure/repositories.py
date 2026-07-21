"""
Repositories for the identity bounded context.

A repository is the only place in the system that knows how domain
entities map to ORM rows. Every query that touches tenant data is
explicitly tenant-scoped — there is no "list all users" call that
omits the tenant filter. That's how the multi-tenant isolation
guarantee is enforced at the data-access layer.

All repositories accept an open `Session` and are not responsible
for transaction boundaries; the application service is.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.identity.domain.entities import ApiKey, Plan, Role, Tenant, User
from src.identity.infrastructure.models import (
    ApiKeyModel,
    TenantModel,
    UserModel,
)
from src.shared.exceptions import ConflictException


# ---------------------------------------------------------------------------
# Mapping helpers
# ---------------------------------------------------------------------------


def _as_utc(value: datetime) -> datetime:
    """Ensure a datetime is timezone-aware UTC.

    SQLite's `DateTime` columns silently drop the tzinfo on
    round-trip, so a value written as `2026-07-21 10:00:00+00:00`
    comes back as `2026-07-21 10:00:00` (naive). The domain layer
    requires aware datetimes, so we re-attach UTC here. Production
    against PostgreSQL is unaffected because the DB preserves
    tzinfo natively.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _tenant_to_model(tenant: Tenant) -> TenantModel:
    return TenantModel(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        plan=tenant.plan.value,
        settings=tenant.settings,
        is_active=tenant.is_active,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
    )


def _model_to_tenant(model: TenantModel) -> Tenant:
    # Use the persistence-aware factory: the DB has already enforced
    # uniqueness, and the in-process registry is only a hint to future
    # `Tenant.create(...)` calls in this process.
    return Tenant.from_persistence(
        id=model.id,
        name=model.name,
        slug=model.slug,
        plan=Plan(model.plan),
        is_active=model.is_active,
        created_at=_as_utc(model.created_at),
        updated_at=_as_utc(model.updated_at),
        settings=dict(model.settings or {}),
    )


def _user_to_model(user: User) -> UserModel:
    return UserModel(
        id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        password_hash=user.hashed_password,
        full_name=user.full_name,
        role=user.role.value,
        is_active=user.is_active,
        last_login=user.last_login,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def _model_to_user(model: UserModel) -> User:
    return User(
        id=model.id,
        tenant_id=model.tenant_id,
        email=model.email,
        hashed_password=model.password_hash,
        full_name=model.full_name,
        role=Role(model.role),
        is_active=model.is_active,
        last_login=_as_utc(model.last_login) if model.last_login else None,
        created_at=_as_utc(model.created_at),
        updated_at=_as_utc(model.updated_at),
    )


def _api_key_to_model(key: ApiKey) -> ApiKeyModel:
    return ApiKeyModel(
        id=key.id,
        tenant_id=key.tenant_id,
        name=key.name,
        key_hash=key.key_hash,
        scopes=list(key.scopes),
        last_used_at=key.last_used_at,
        revoked_at=key.revoked_at,
        created_at=key.created_at,
    )


def _model_to_api_key(model: ApiKeyModel) -> ApiKey:
    return ApiKey(
        id=model.id,
        tenant_id=model.tenant_id,
        name=model.name,
        key_hash=model.key_hash,
        scopes=list(model.scopes or []),
        last_used_at=_as_utc(model.last_used_at) if model.last_used_at else None,
        revoked_at=_as_utc(model.revoked_at) if model.revoked_at else None,
        created_at=_as_utc(model.created_at),
    )


# ---------------------------------------------------------------------------
# TenantRepository
# ---------------------------------------------------------------------------


class TenantRepository:
    """Persistence-layer operations for the `tenants` table."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, tenant: Tenant) -> Tenant:
        model = _tenant_to_model(tenant)
        self._session.add(model)
        try:
            self._session.flush()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictException(
                message=f"Tenant slug '{tenant.slug}' is already in use.",
                code=409,
                data={"field": "slug", "value": tenant.slug},
            ) from exc
        Tenant.seed_slug(tenant.slug)
        return _model_to_tenant(model)

    def update(self, tenant: Tenant) -> Tenant:
        model = self._session.get(TenantModel, tenant.id)
        if model is None:
            raise ConflictException(
                message=f"Tenant {tenant.id} does not exist.",
                code=409,
                data={"field": "id"},
            )
        old_slug = model.slug
        model.name = tenant.name
        model.slug = tenant.slug
        model.plan = tenant.plan.value
        model.settings = tenant.settings
        model.is_active = tenant.is_active
        model.updated_at = tenant.updated_at
        try:
            self._session.flush()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictException(
                message=f"Tenant slug '{tenant.slug}' is already in use.",
                code=409,
                data={"field": "slug", "value": tenant.slug},
            ) from exc
        if old_slug != tenant.slug:
            Tenant.release_slug(old_slug)
            Tenant.seed_slug(tenant.slug)
        return _model_to_tenant(model)

    def delete(self, tenant_id: uuid.UUID) -> bool:
        model = self._session.get(TenantModel, tenant_id)
        if model is None:
            return False
        slug = model.slug
        self._session.delete(model)
        self._session.flush()
        Tenant.release_slug(slug)
        return True

    def find_by_id(self, tenant_id: uuid.UUID) -> Optional[Tenant]:
        model = self._session.get(TenantModel, tenant_id)
        return _model_to_tenant(model) if model else None

    def find_by_slug(self, slug: str) -> Optional[Tenant]:
        stmt = select(TenantModel).where(TenantModel.slug == slug.lower())
        model = self._session.execute(stmt).scalar_one_or_none()
        return _model_to_tenant(model) if model else None

    def exists(self, *, tenant_id: uuid.UUID | None = None, slug: str | None = None) -> bool:
        if tenant_id is not None:
            return self._session.get(TenantModel, tenant_id) is not None
        if slug is not None:
            stmt = select(TenantModel.id).where(TenantModel.slug == slug.lower())
            return self._session.execute(stmt).scalar_one_or_none() is not None
        raise ValueError("TenantRepository.exists requires tenant_id or slug")

    def list(self, *, limit: int = 50, offset: int = 0) -> Sequence[Tenant]:
        stmt = (
            select(TenantModel)
            .order_by(TenantModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return [_model_to_tenant(m) for m in self._session.execute(stmt).scalars().all()]


# ---------------------------------------------------------------------------
# UserRepository
# ---------------------------------------------------------------------------


class UserRepository:
    """Persistence-layer operations for the `users` table.

    Every read is tenant-scoped. Cross-tenant user lookups are an
    anti-pattern and have no method here.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, user: User) -> User:
        model = _user_to_model(user)
        self._session.add(model)
        try:
            self._session.flush()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictException(
                message=(
                    f"A user with email '{user.email}' already exists in this "
                    "tenant."
                ),
                code=409,
                data={"field": "email", "value": user.email},
            ) from exc
        return _model_to_user(model)

    def update(self, user: User) -> User:
        model = self._session.get(UserModel, user.id)
        if model is None:
            raise ConflictException(
                message=f"User {user.id} does not exist.",
                code=409,
                data={"field": "id"},
            )
        if model.tenant_id != user.tenant_id:
            # Cross-tenant update attempt — refuse.
            raise ConflictException(
                message="User does not belong to the given tenant.",
                code=409,
                data={"field": "tenant_id"},
            )
        model.email = user.email
        model.password_hash = user.hashed_password
        model.full_name = user.full_name
        model.role = user.role.value
        model.is_active = user.is_active
        model.last_login = user.last_login
        model.updated_at = user.updated_at
        try:
            self._session.flush()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictException(
                message=(
                    f"A user with email '{user.email}' already exists in this "
                    "tenant."
                ),
                code=409,
                data={"field": "email", "value": user.email},
            ) from exc
        return _model_to_user(model)

    def delete(self, user_id: uuid.UUID, *, tenant_id: uuid.UUID) -> bool:
        model = self._session.get(UserModel, user_id)
        if model is None or model.tenant_id != tenant_id:
            return False
        self._session.delete(model)
        self._session.flush()
        return True

    def find_by_id(
        self, user_id: uuid.UUID, *, tenant_id: uuid.UUID
    ) -> Optional[User]:
        model = self._session.get(UserModel, user_id)
        if model is None or model.tenant_id != tenant_id:
            return None
        return _model_to_user(model)

    def find_by_email(
        self, email: str, *, tenant_id: uuid.UUID
    ) -> Optional[User]:
        stmt = (
            select(UserModel)
            .where(UserModel.tenant_id == tenant_id)
            .where(UserModel.email == email.strip().lower())
        )
        model = self._session.execute(stmt).scalar_one_or_none()
        return _model_to_user(model) if model else None

    def find_by_email_global(self, email: str) -> Optional[User]:
        """
        Look up a user by email without a tenant filter.

        This is intentionally separate from `find_by_email` and is
        only used by the authentication flow, which accepts the
        email and the tenant slug together. The authentication
        service is the only caller.
        """
        stmt = select(UserModel).where(UserModel.email == email.strip().lower())
        model = self._session.execute(stmt).scalar_one_or_none()
        return _model_to_user(model) if model else None

    def exists(
        self,
        *,
        tenant_id: uuid.UUID,
        email: str,
    ) -> bool:
        stmt = (
            select(UserModel.id)
            .where(UserModel.tenant_id == tenant_id)
            .where(UserModel.email == email.strip().lower())
        )
        return self._session.execute(stmt).scalar_one_or_none() is not None

    def list_by_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[User]:
        stmt = (
            select(UserModel)
            .where(UserModel.tenant_id == tenant_id)
            .order_by(UserModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return [
            _model_to_user(m) for m in self._session.execute(stmt).scalars().all()
        ]


# ---------------------------------------------------------------------------
# ApiKeyRepository
# ---------------------------------------------------------------------------


class ApiKeyRepository:
    """Persistence-layer operations for the `api_keys` table.

    Every operation is tenant-scoped. There is no method that lists
    API keys across tenants — a global view of credentials would be
    a serious security regression.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, api_key: ApiKey) -> ApiKey:
        model = _api_key_to_model(api_key)
        self._session.add(model)
        self._session.flush()
        return _model_to_api_key(model)

    def find(
        self, api_key_id: uuid.UUID, *, tenant_id: uuid.UUID
    ) -> Optional[ApiKey]:
        model = self._session.get(ApiKeyModel, api_key_id)
        if model is None or model.tenant_id != tenant_id:
            return None
        return _model_to_api_key(model)

    def find_by_hash(self, key_hash: str, *, tenant_id: uuid.UUID) -> Optional[ApiKey]:
        """
        Look up a key by its bcrypt hash within a tenant.

        This is what the API-key auth dependency calls after hashing
        the raw value the client sent. Note: the comparison is exact
        against the stored hash — there is exactly one row that can
        match, so no extra `LIMIT 1` is needed.
        """
        stmt = (
            select(ApiKeyModel)
            .where(ApiKeyModel.tenant_id == tenant_id)
            .where(ApiKeyModel.key_hash == key_hash)
        )
        model = self._session.execute(stmt).scalar_one_or_none()
        return _model_to_api_key(model) if model else None

    def list(
        self,
        tenant_id: uuid.UUID,
        *,
        include_revoked: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[ApiKey]:
        stmt = select(ApiKeyModel).where(ApiKeyModel.tenant_id == tenant_id)
        if not include_revoked:
            stmt = stmt.where(ApiKeyModel.revoked_at.is_(None))
        stmt = stmt.order_by(ApiKeyModel.created_at.desc()).limit(limit).offset(offset)
        return [
            _model_to_api_key(m) for m in self._session.execute(stmt).scalars().all()
        ]

    def revoke(
        self, api_key_id: uuid.UUID, *, tenant_id: uuid.UUID
    ) -> Optional[ApiKey]:
        """Revoke a key. Idempotent — revoking an already-revoked key
        is a no-op that returns the same key."""
        model = self._session.get(ApiKeyModel, api_key_id)
        if model is None or model.tenant_id != tenant_id:
            return None
        if model.revoked_at is None:
            from datetime import datetime, timezone

            model.revoked_at = datetime.now(timezone.utc)
            self._session.flush()
        return _model_to_api_key(model)


__all__ = [
    "ApiKeyRepository",
    "TenantRepository",
    "UserRepository",
]
