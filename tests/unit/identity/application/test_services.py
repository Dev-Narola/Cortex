"""
Unit tests for the application services (SQLite-backed).
"""

from __future__ import annotations

import uuid

import pytest

from src.identity.application.services import (
    AuthenticateUserService,
    CreateApiKeyService,
    GetCurrentUserService,
    RegisterTenantService,
    RevokeApiKeyService,
    UpdateProfileService,
    UpdateTenantService,
)
from src.identity.domain.entities import ApiKey, Plan, Role, Tenant
from src.identity.infrastructure.repositories import (
    ApiKeyRepository,
    TenantRepository,
    UserRepository,
)
from src.identity.infrastructure.security import (
    decode_access_token,
    verify_password,
)
from src.shared.exceptions import (
    ConflictException,
    NotFoundException,
    UnauthorizedException,
    ValidationException,
)


# ---------------------------------------------------------------------------
# RegisterTenantService
# ---------------------------------------------------------------------------


def test_register_tenant_creates_tenant_and_owner_user(db_session):
    service = RegisterTenantService(db_session)
    result = service.execute(
        tenant_name="Acme",
        tenant_slug="acme",
        owner_email="alice@example.com",
        owner_password="SuperSecret123!",
        owner_full_name="Alice",
    )

    assert result.tenant.name == "Acme"
    assert result.tenant.slug == "acme"
    assert result.tenant.plan is Plan.FREE
    assert result.owner.email == "alice@example.com"
    assert result.owner.role is Role.OWNER
    assert result.owner.full_name == "Alice"
    assert result.owner.tenant_id == result.tenant.id
    # Password is stored as a hash, not in the clear.
    assert result.owner.hashed_password != "SuperSecret123!"
    assert verify_password("SuperSecret123!", result.owner.hashed_password)


def test_register_tenant_rejects_short_password(db_session):
    service = RegisterTenantService(db_session)
    with pytest.raises(ValidationException):
        service.execute(
            tenant_name="A",
            tenant_slug="short-pw",
            owner_email="a@x.com",
            owner_password="short",
        )


def test_register_tenant_rejects_duplicate_slug(db_session):
    RegisterTenantService(db_session).execute(
        tenant_name="A",
        tenant_slug="dup",
        owner_email="a@x.com",
        owner_password="ValidPassword123!",
    )
    with pytest.raises(ConflictException):
        RegisterTenantService(db_session).execute(
            tenant_name="B",
            tenant_slug="dup",
            owner_email="b@x.com",
            owner_password="ValidPassword123!",
        )


# ---------------------------------------------------------------------------
# AuthenticateUserService
# ---------------------------------------------------------------------------


def _register(db_session, *, slug: str, email: str, password: str = "ValidPassword123!"):
    return RegisterTenantService(db_session).execute(
        tenant_name="T",
        tenant_slug=slug,
        owner_email=email,
        owner_password=password,
    )


def test_authenticate_returns_access_and_refresh_tokens(db_session):
    _register(db_session, slug="auth", email="alice@x.com", password="ValidPassword123!")
    service = AuthenticateUserService(db_session)
    issued = service.execute(
        tenant_slug="auth", email="alice@x.com", password="ValidPassword123!"
    )

    assert issued.access_token
    assert issued.refresh_token
    assert issued.token_type == "bearer"
    assert issued.expires_in > 0
    assert issued.user.email == "alice@x.com"
    assert issued.tenant.slug == "auth"

    # The tokens are valid JWTs.
    access_claims = decode_access_token(issued.access_token, expected_type="access")
    assert access_claims["email"] == "alice@x.com"
    refresh_claims = decode_access_token(issued.refresh_token, expected_type="refresh")
    assert refresh_claims["typ"] == "refresh"


def test_authenticate_updates_last_login(db_session):
    result = _register(db_session, slug="login", email="u@x.com", password="ValidPassword123!")
    assert result.owner.last_login is None

    issued = AuthenticateUserService(db_session).execute(
        tenant_slug="login", email="u@x.com", password="ValidPassword123!"
    )
    assert issued.user.last_login is not None

    # And it's persisted (re-read from the DB).
    fresh = UserRepository(db_session).find_by_id(result.owner.id, tenant_id=result.tenant.id)
    assert fresh is not None
    assert fresh.last_login is not None


def test_authenticate_rejects_unknown_tenant(db_session):
    with pytest.raises(UnauthorizedException):
        AuthenticateUserService(db_session).execute(
            tenant_slug="missing",
            email="a@x.com",
            password="ValidPassword123!",
        )


def test_authenticate_rejects_wrong_password(db_session):
    _register(db_session, slug="wp", email="a@x.com", password="ValidPassword123!")
    with pytest.raises(UnauthorizedException):
        AuthenticateUserService(db_session).execute(
            tenant_slug="wp", email="a@x.com", password="WrongPassword456!"
        )


def test_authenticate_rejects_unknown_email(db_session):
    _register(db_session, slug="ue", email="known@x.com", password="ValidPassword123!")
    with pytest.raises(UnauthorizedException):
        AuthenticateUserService(db_session).execute(
            tenant_slug="ue", email="unknown@x.com", password="ValidPassword123!"
        )


def test_authenticate_rejects_inactive_user(db_session):
    result = _register(db_session, slug="inactive", email="u@x.com", password="ValidPassword123!")
    result.owner.deactivate()
    UserRepository(db_session).update(result.owner)
    db_session.commit()

    with pytest.raises(UnauthorizedException) as exc_info:
        AuthenticateUserService(db_session).execute(
            tenant_slug="inactive", email="u@x.com", password="ValidPassword123!"
        )
    assert "inactive" in exc_info.value.message


def test_authenticate_refresh_exchanges_token(db_session):
    _register(db_session, slug="ref", email="u@x.com", password="ValidPassword123!")
    issued = AuthenticateUserService(db_session).execute(
        tenant_slug="ref", email="u@x.com", password="ValidPassword123!"
    )

    service = AuthenticateUserService(db_session)
    new = service.refresh(refresh_token=issued.refresh_token)
    assert new.access_token
    assert new.refresh_token
    assert new.user.email == "u@x.com"


def test_authenticate_refresh_rejects_access_token(db_session):
    _register(db_session, slug="ref2", email="u@x.com", password="ValidPassword123!")
    issued = AuthenticateUserService(db_session).execute(
        tenant_slug="ref2", email="u@x.com", password="ValidPassword123!"
    )
    with pytest.raises(UnauthorizedException):
        AuthenticateUserService(db_session).refresh(refresh_token=issued.access_token)


# ---------------------------------------------------------------------------
# GetCurrentUserService
# ---------------------------------------------------------------------------


def test_get_current_user_resolves(db_session):
    result = _register(db_session, slug="me", email="u@x.com", password="ValidPassword123!")
    service = GetCurrentUserService(db_session)
    user, tenant = service.execute(
        user_id=result.owner.id, tenant_id=result.tenant.id
    )
    assert user.id == result.owner.id
    assert tenant.id == result.tenant.id


def test_get_current_user_rejects_inactive_user(db_session):
    result = _register(db_session, slug="inactive2", email="u@x.com", password="ValidPassword123!")
    result.owner.deactivate()
    UserRepository(db_session).update(result.owner)
    db_session.commit()

    with pytest.raises(UnauthorizedException):
        GetCurrentUserService(db_session).execute(
            user_id=result.owner.id, tenant_id=result.tenant.id
        )


# ---------------------------------------------------------------------------
# UpdateProfileService
# ---------------------------------------------------------------------------


def test_update_profile_changes_full_name(db_session):
    result = _register(db_session, slug="upd", email="u@x.com", password="ValidPassword123!")
    service = UpdateProfileService(db_session)
    updated = service.execute(
        user_id=result.owner.id,
        tenant_id=result.tenant.id,
        full_name="Alice Updated",
    )
    assert updated.full_name == "Alice Updated"

    fresh = UserRepository(db_session).find_by_id(result.owner.id, tenant_id=result.tenant.id)
    assert fresh is not None
    assert fresh.full_name == "Alice Updated"


# ---------------------------------------------------------------------------
# CreateApiKeyService / RevokeApiKeyService
# ---------------------------------------------------------------------------


def test_create_api_key_returns_raw_key_once(db_session):
    result = _register(db_session, slug="api", email="u@x.com", password="ValidPassword123!")
    service = CreateApiKeyService(db_session)
    issued = service.execute(
        tenant_id=result.tenant.id,
        name="CI pipeline",
        scopes=["documents:read", "search:read"],
    )

    assert issued.raw_key.startswith("ctx_")
    # The stored hash is not the raw key.
    assert issued.api_key.key_hash != issued.raw_key
    # The raw key, when hashed, should match the stored hash.
    from src.identity.infrastructure.security import verify_api_key
    assert verify_api_key(issued.raw_key, issued.api_key.key_hash)
    # The persisted entity has the scopes.
    assert issued.api_key.scopes == ["documents:read", "search:read"]


def test_revoke_api_key_sets_revoked_at(db_session):
    result = _register(db_session, slug="revoke", email="u@x.com", password="ValidPassword123!")
    issued = CreateApiKeyService(db_session).execute(
        tenant_id=result.tenant.id, name="k"
    )
    service = RevokeApiKeyService(db_session)
    revoked = service.execute(api_key_id=issued.api_key.id, tenant_id=result.tenant.id)
    assert revoked.revoked_at is not None
    assert revoked.is_valid() is False


def test_revoke_api_key_is_idempotent(db_session):
    result = _register(db_session, slug="revoke2", email="u@x.com", password="ValidPassword123!")
    issued = CreateApiKeyService(db_session).execute(
        tenant_id=result.tenant.id, name="k"
    )
    service = RevokeApiKeyService(db_session)
    first = service.execute(api_key_id=issued.api_key.id, tenant_id=result.tenant.id)
    second = service.execute(api_key_id=issued.api_key.id, tenant_id=result.tenant.id)
    assert first.revoked_at == second.revoked_at


def test_revoke_unknown_key_raises_not_found(db_session):
    result = _register(db_session, slug="rev3", email="u@x.com", password="ValidPassword123!")
    with pytest.raises(NotFoundException):
        RevokeApiKeyService(db_session).execute(
            api_key_id=uuid.uuid4(), tenant_id=result.tenant.id
        )


def test_revoke_cross_tenant_key_raises_not_found(db_session):
    result = _register(db_session, slug="rev4", email="u@x.com", password="ValidPassword123!")
    issued = CreateApiKeyService(db_session).execute(
        tenant_id=result.tenant.id, name="k"
    )
    # A different tenant shouldn't be able to revoke it.
    TenantRepository(db_session).create(Tenant.create(name="Other", slug="other-rev"))
    db_session.commit()
    other = TenantRepository(db_session).find_by_slug("other-rev")
    assert other is not None
    with pytest.raises(NotFoundException):
        RevokeApiKeyService(db_session).execute(
            api_key_id=issued.api_key.id, tenant_id=other.id
        )


# ---------------------------------------------------------------------------
# UpdateTenantService
# ---------------------------------------------------------------------------


def test_update_tenant_renames_and_changes_plan(db_session):
    result = _register(db_session, slug="upd-tenant", email="u@x.com", password="ValidPassword123!")
    service = UpdateTenantService(db_session)
    updated = service.execute(
        tenant_id=result.tenant.id,
        name="Renamed",
        plan=Plan.PRO,
    )
    assert updated.name == "Renamed"
    assert updated.plan is Plan.PRO


def test_update_tenant_settings_persisted(db_session):
    result = _register(db_session, slug="upd-settings", email="u@x.com", password="ValidPassword123!")
    service = UpdateTenantService(db_session)
    updated = service.execute(
        tenant_id=result.tenant.id,
        settings={"default_llm": "claude-3-5-sonnet"},
    )
    assert updated.settings == {"default_llm": "claude-3-5-sonnet"}


def test_update_unknown_tenant_raises_not_found(db_session):
    with pytest.raises(NotFoundException):
        UpdateTenantService(db_session).execute(tenant_id=uuid.uuid4(), name="X")
