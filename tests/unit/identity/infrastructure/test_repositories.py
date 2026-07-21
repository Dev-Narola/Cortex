"""
Unit tests for the identity repositories (SQLite-backed).
"""

from __future__ import annotations

import uuid

import pytest

from src.identity.domain.entities import ApiKey, Plan, Role, Tenant, User
from src.identity.infrastructure.models import ApiKeyModel, TenantModel, UserModel
from src.identity.infrastructure.repositories import (
    ApiKeyRepository,
    TenantRepository,
    UserRepository,
)
from src.identity.infrastructure.security import hash_api_key, hash_password
from src.shared.exceptions import ConflictException


SAMPLE_HASH = hash_password("TestPassword123!")
SAMPLE_API_KEY_HASH = hash_api_key("ctx_test_raw_key")


# ---------------------------------------------------------------------------
# TenantRepository
# ---------------------------------------------------------------------------


def test_tenant_repo_create_persists(db_session):
    repo = TenantRepository(db_session)
    tenant = Tenant.create(name="Acme", slug="acme")
    saved = repo.create(tenant)
    assert saved.id == tenant.id
    assert saved.name == "Acme"
    assert saved.slug == "acme"

    row = db_session.get(TenantModel, saved.id)
    assert row is not None
    assert row.name == "Acme"
    assert row.slug == "acme"


def test_tenant_repo_create_rejects_duplicate_slug(db_session):
    TenantRepository(db_session).create(Tenant.create(name="A", slug="dup"))
    db_session.commit()

    with pytest.raises(ConflictException) as exc_info:
        TenantRepository(db_session).create(Tenant.create(name="B", slug="dup"))
    assert "already in use" in exc_info.value.message


def test_tenant_repo_find_by_id(db_session):
    repo = TenantRepository(db_session)
    tenant = repo.create(Tenant.create(name="A", slug="by-id"))
    db_session.commit()

    found = repo.find_by_id(tenant.id)
    assert found is not None
    assert found.id == tenant.id
    assert found.name == "A"


def test_tenant_repo_find_by_id_missing_returns_none(db_session):
    assert TenantRepository(db_session).find_by_id(uuid.uuid4()) is None


def test_tenant_repo_find_by_slug(db_session):
    TenantRepository(db_session).create(Tenant.create(name="A", slug="by-slug"))
    db_session.commit()

    found = TenantRepository(db_session).find_by_slug("by-slug")
    assert found is not None
    assert found.slug == "by-slug"


def test_tenant_repo_find_by_slug_lowercases_input(db_session):
    TenantRepository(db_session).create(Tenant.create(name="A", slug="MixedCase"))
    db_session.commit()

    assert TenantRepository(db_session).find_by_slug("mixedcase") is not None


def test_tenant_repo_exists(db_session):
    repo = TenantRepository(db_session)
    tenant = repo.create(Tenant.create(name="A", slug="exists-test"))
    db_session.commit()

    assert repo.exists(tenant_id=tenant.id) is True
    assert repo.exists(slug="exists-test") is True
    assert repo.exists(tenant_id=uuid.uuid4()) is False


def test_tenant_repo_update(db_session):
    repo = TenantRepository(db_session)
    tenant = repo.create(Tenant.create(name="A", slug="upd"))
    db_session.commit()

    tenant.rename("Updated")
    tenant.change_plan(Plan.PRO)
    updated = repo.update(tenant)
    db_session.commit()

    assert updated.name == "Updated"
    assert updated.plan is Plan.PRO

    row = db_session.get(TenantModel, tenant.id)
    assert row.name == "Updated"
    assert row.plan == "pro"


def test_tenant_repo_delete(db_session):
    repo = TenantRepository(db_session)
    tenant = repo.create(Tenant.create(name="A", slug="del"))
    db_session.commit()

    assert repo.delete(tenant.id) is True
    db_session.commit()
    assert repo.find_by_id(tenant.id) is None


def test_tenant_repo_delete_missing_returns_false(db_session):
    assert TenantRepository(db_session).delete(uuid.uuid4()) is False


def test_tenant_repo_list(db_session):
    repo = TenantRepository(db_session)
    for i in range(5):
        repo.create(Tenant.create(name=f"T{i}", slug=f"t-{i}"))
    db_session.commit()

    listed = list(repo.list(limit=10))
    assert len(listed) >= 5


# ---------------------------------------------------------------------------
# UserRepository
# ---------------------------------------------------------------------------


def _make_tenant(db_session) -> Tenant:
    repo = TenantRepository(db_session)
    tenant = repo.create(Tenant.create(name="T", slug="tenant-for-users"))
    db_session.commit()
    return tenant


def test_user_repo_create_persists(db_session):
    tenant = _make_tenant(db_session)
    user = User.create(
        tenant_id=tenant.id,
        email="a@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
    )
    saved = UserRepository(db_session).create(user)
    db_session.commit()

    assert saved.id == user.id
    row = db_session.get(UserModel, saved.id)
    assert row is not None
    assert row.tenant_id == tenant.id
    assert row.email == "a@example.com"
    assert row.password_hash == SAMPLE_HASH
    assert row.role == "member"


def test_user_repo_email_is_lowercased_in_storage(db_session):
    tenant = _make_tenant(db_session)
    UserRepository(db_session).create(
        User.create(
            tenant_id=tenant.id,
            email="MIXED@Example.COM",
            hashed_password=SAMPLE_HASH,
            role=Role.MEMBER,
        )
    )
    db_session.commit()

    found = UserRepository(db_session).find_by_email("mixed@example.com", tenant_id=tenant.id)
    assert found is not None


def test_user_repo_unique_email_per_tenant(db_session):
    tenant = _make_tenant(db_session)
    repo = UserRepository(db_session)
    repo.create(
        User.create(tenant_id=tenant.id, email="dup@example.com",
                    hashed_password=SAMPLE_HASH, role=Role.MEMBER)
    )
    db_session.commit()

    with pytest.raises(ConflictException):
        repo.create(
            User.create(tenant_id=tenant.id, email="dup@example.com",
                        hashed_password=SAMPLE_HASH, role=Role.MEMBER)
        )


def test_user_repo_email_can_be_reused_across_tenants(db_session):
    t1 = _make_tenant(db_session)
    TenantRepository(db_session).create(Tenant.create(name="T2", slug="tenant-2"))
    db_session.commit()
    t2 = TenantRepository(db_session).find_by_slug("tenant-2")
    assert t2 is not None

    UserRepository(db_session).create(
        User.create(tenant_id=t1.id, email="shared@example.com",
                    hashed_password=SAMPLE_HASH, role=Role.MEMBER)
    )
    UserRepository(db_session).create(
        User.create(tenant_id=t2.id, email="shared@example.com",
                    hashed_password=SAMPLE_HASH, role=Role.MEMBER)
    )
    db_session.commit()
    # Both inserts succeed.


def test_user_repo_find_by_id_tenant_scoped(db_session):
    t1 = _make_tenant(db_session)
    TenantRepository(db_session).create(Tenant.create(name="T2", slug="tenant-scope"))
    db_session.commit()
    t2 = TenantRepository(db_session).find_by_slug("tenant-scope")
    assert t2 is not None

    user = UserRepository(db_session).create(
        User.create(tenant_id=t1.id, email="x@example.com",
                    hashed_password=SAMPLE_HASH, role=Role.MEMBER)
    )
    db_session.commit()

    found = UserRepository(db_session).find_by_id(user.id, tenant_id=t1.id)
    assert found is not None
    assert found.id == user.id

    # Same id, wrong tenant -> None (tenant isolation)
    assert UserRepository(db_session).find_by_id(user.id, tenant_id=t2.id) is None


def test_user_repo_find_by_email_tenant_scoped(db_session):
    t1 = _make_tenant(db_session)
    TenantRepository(db_session).create(Tenant.create(name="T2", slug="other-tenant"))
    db_session.commit()
    t2 = TenantRepository(db_session).find_by_slug("other-tenant")
    assert t2 is not None

    UserRepository(db_session).create(
        User.create(tenant_id=t1.id, email="x@example.com",
                    hashed_password=SAMPLE_HASH, role=Role.MEMBER)
    )
    db_session.commit()

    assert UserRepository(db_session).find_by_email("x@example.com", tenant_id=t1.id) is not None
    assert UserRepository(db_session).find_by_email("x@example.com", tenant_id=t2.id) is None


def test_user_repo_exists(db_session):
    tenant = _make_tenant(db_session)
    UserRepository(db_session).create(
        User.create(tenant_id=tenant.id, email="e@x.com",
                    hashed_password=SAMPLE_HASH, role=Role.MEMBER)
    )
    db_session.commit()

    repo = UserRepository(db_session)
    assert repo.exists(tenant_id=tenant.id, email="e@x.com") is True
    assert repo.exists(tenant_id=tenant.id, email="nope@x.com") is False
    assert repo.exists(tenant_id=uuid.uuid4(), email="e@x.com") is False


def test_user_repo_list_by_tenant(db_session):
    t1 = _make_tenant(db_session)
    TenantRepository(db_session).create(Tenant.create(name="T2", slug="list-tenant"))
    db_session.commit()
    t2 = TenantRepository(db_session).find_by_slug("list-tenant")
    assert t2 is not None

    repo = UserRepository(db_session)
    for i in range(3):
        repo.create(User.create(tenant_id=t1.id, email=f"u{i}@x.com",
                                 hashed_password=SAMPLE_HASH, role=Role.MEMBER))
    repo.create(User.create(tenant_id=t2.id, email="other@x.com",
                            hashed_password=SAMPLE_HASH, role=Role.MEMBER))
    db_session.commit()

    users = list(repo.list_by_tenant(t1.id, limit=10))
    assert len(users) == 3
    for u in users:
        assert u.tenant_id == t1.id


def test_user_repo_update_persists_changes(db_session):
    tenant = _make_tenant(db_session)
    repo = UserRepository(db_session)
    user = repo.create(
        User.create(tenant_id=tenant.id, email="up@x.com",
                    hashed_password=SAMPLE_HASH, role=Role.MEMBER,
                    full_name="Before")
    )
    db_session.commit()

    user.set_full_name("After")
    user.change_role(Role.ADMIN)
    repo.update(user)
    db_session.commit()

    row = db_session.get(UserModel, user.id)
    assert row.full_name == "After"
    assert row.role == "admin"


def test_user_repo_delete_tenant_scoped(db_session):
    t1 = _make_tenant(db_session)
    TenantRepository(db_session).create(Tenant.create(name="T2", slug="del-tenant"))
    db_session.commit()
    t2 = TenantRepository(db_session).find_by_slug("del-tenant")
    assert t2 is not None

    user = UserRepository(db_session).create(
        User.create(tenant_id=t1.id, email="del@x.com",
                    hashed_password=SAMPLE_HASH, role=Role.MEMBER)
    )
    db_session.commit()

    # Cross-tenant delete attempt returns False (no-op)
    assert UserRepository(db_session).delete(user.id, tenant_id=t2.id) is False
    # Correct tenant deletes
    assert UserRepository(db_session).delete(user.id, tenant_id=t1.id) is True


# ---------------------------------------------------------------------------
# ApiKeyRepository
# ---------------------------------------------------------------------------


def test_api_key_repo_create_persists(db_session):
    tenant = _make_tenant(db_session)
    key = ApiKey.create(
        tenant_id=tenant.id, name="k1", key_hash=SAMPLE_API_KEY_HASH,
        scopes=["documents:read"],
    )
    saved = ApiKeyRepository(db_session).create(key)
    db_session.commit()

    row = db_session.get(ApiKeyModel, saved.id)
    assert row is not None
    assert row.name == "k1"
    assert row.key_hash == SAMPLE_API_KEY_HASH
    assert row.scopes == ["documents:read"]


def test_api_key_repo_find_tenant_scoped(db_session):
    t1 = _make_tenant(db_session)
    TenantRepository(db_session).create(Tenant.create(name="T2", slug="key-tenant"))
    db_session.commit()
    t2 = TenantRepository(db_session).find_by_slug("key-tenant")
    assert t2 is not None

    key = ApiKeyRepository(db_session).create(
        ApiKey.create(tenant_id=t1.id, name="k", key_hash=SAMPLE_API_KEY_HASH)
    )
    db_session.commit()

    assert ApiKeyRepository(db_session).find(key.id, tenant_id=t1.id) is not None
    assert ApiKeyRepository(db_session).find(key.id, tenant_id=t2.id) is None


def test_api_key_repo_list_excludes_revoked_by_default(db_session):
    tenant = _make_tenant(db_session)
    repo = ApiKeyRepository(db_session)
    active = repo.create(ApiKey.create(tenant_id=tenant.id, name="active", key_hash=SAMPLE_API_KEY_HASH))
    revoked = repo.create(ApiKey.create(tenant_id=tenant.id, name="revoked", key_hash=SAMPLE_API_KEY_HASH))
    db_session.commit()
    repo.revoke(revoked.id, tenant_id=tenant.id)
    db_session.commit()

    listed = list(repo.list(tenant.id))
    assert len(listed) == 1
    assert listed[0].id == active.id

    listed_with_revoked = list(repo.list(tenant.id, include_revoked=True))
    assert len(listed_with_revoked) == 2


def test_api_key_repo_revoke_is_idempotent(db_session):
    tenant = _make_tenant(db_session)
    repo = ApiKeyRepository(db_session)
    key = repo.create(ApiKey.create(tenant_id=tenant.id, name="k", key_hash=SAMPLE_API_KEY_HASH))
    db_session.commit()

    first = repo.revoke(key.id, tenant_id=tenant.id)
    db_session.commit()
    second = repo.revoke(key.id, tenant_id=tenant.id)
    db_session.commit()

    assert first is not None
    assert second is not None
    assert first.revoked_at == second.revoked_at


def test_api_key_repo_revoke_missing_returns_none(db_session):
    tenant = _make_tenant(db_session)
    assert ApiKeyRepository(db_session).revoke(uuid.uuid4(), tenant_id=tenant.id) is None


def test_api_key_repo_find_by_hash_tenant_scoped(db_session):
    t1 = _make_tenant(db_session)
    TenantRepository(db_session).create(Tenant.create(name="T2", slug="hash-tenant"))
    db_session.commit()
    t2 = TenantRepository(db_session).find_by_slug("hash-tenant")
    assert t2 is not None

    repo = ApiKeyRepository(db_session)
    repo.create(ApiKey.create(tenant_id=t1.id, name="k", key_hash=SAMPLE_API_KEY_HASH))
    db_session.commit()

    assert repo.find_by_hash(SAMPLE_API_KEY_HASH, tenant_id=t1.id) is not None
    assert repo.find_by_hash(SAMPLE_API_KEY_HASH, tenant_id=t2.id) is None
    assert repo.find_by_hash("not-a-hash", tenant_id=t1.id) is None
