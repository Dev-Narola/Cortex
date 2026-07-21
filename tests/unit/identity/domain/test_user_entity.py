"""
Unit tests for the User domain entity.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from src.identity.domain.entities import Role, Tenant, User
from src.identity.infrastructure.security import hash_password
from src.shared.exceptions import UnauthorizedException, ValidationException

# A bcrypt hash is required for any User — use this for tests.
SAMPLE_HASH = hash_password("CorrectHorseBatteryStaple!")


@pytest.fixture(autouse=True)
def _reset_slug_registry():
    Tenant.reset_slug_registry()
    yield
    Tenant.reset_slug_registry()


def _tenant_id() -> uuid.UUID:
    return uuid.uuid4()


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_create_user_with_minimal_fields():
    user = User.create(
        tenant_id=_tenant_id(),
        email="alice@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
    )
    assert user.email == "alice@example.com"
    assert user.role is Role.MEMBER
    assert user.is_active is True
    assert user.last_login is None
    assert user.full_name is None


def test_email_is_lowercased_and_stripped():
    user = User.create(
        tenant_id=_tenant_id(),
        email="  ALICE@Example.COM  ",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
    )
    assert user.email == "alice@example.com"


def test_role_string_is_coerced_to_enum():
    user = User.create(
        tenant_id=_tenant_id(),
        email="bob@example.com",
        hashed_password=SAMPLE_HASH,
        role="admin",
    )
    assert user.role is Role.ADMIN


def test_user_uuid_id_assigned():
    user = User.create(
        tenant_id=_tenant_id(),
        email="c@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
    )
    assert isinstance(user.id, uuid.UUID)


# ---------------------------------------------------------------------------
# Business rules
# ---------------------------------------------------------------------------


def test_user_entity_rejects_raw_password():
    """The entity must never accept a plaintext password — only a hash."""
    with pytest.raises(ValidationException) as exc_info:
        User.create(
            tenant_id=_tenant_id(),
            email="d@example.com",
            hashed_password="not-a-hash",
            role=Role.MEMBER,
        )
    assert "bcrypt hash" in exc_info.value.message


def test_empty_email_rejected():
    with pytest.raises(ValidationException) as exc_info:
        User.create(
            tenant_id=_tenant_id(),
            email="",
            hashed_password=SAMPLE_HASH,
            role=Role.MEMBER,
        )
    assert exc_info.value.data == {"field": "email"}


def test_whitespace_email_rejected():
    with pytest.raises(ValidationException):
        User.create(
            tenant_id=_tenant_id(),
            email="   ",
            hashed_password=SAMPLE_HASH,
            role=Role.MEMBER,
        )


def test_malformed_email_rejected():
    with pytest.raises(ValidationException):
        User.create(
            tenant_id=_tenant_id(),
            email="not-an-email",
            hashed_password=SAMPLE_HASH,
            role=Role.MEMBER,
        )


def test_email_too_long_rejected():
    long_email = "a" * 310 + "@example.com"
    with pytest.raises(ValidationException) as exc_info:
        User.create(
            tenant_id=_tenant_id(),
            email=long_email,
            hashed_password=SAMPLE_HASH,
            role=Role.MEMBER,
        )
    assert "320" in exc_info.value.message


def test_invalid_role_rejected():
    with pytest.raises(ValidationException):
        User.create(
            tenant_id=_tenant_id(),
            email="e@example.com",
            hashed_password=SAMPLE_HASH,
            role="superuser",
        )


def test_inactive_user_cannot_login():
    user = User.create(
        tenant_id=_tenant_id(),
        email="f@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
        is_active=False,
    )
    assert user.can_login() is False
    with pytest.raises(UnauthorizedException) as exc_info:
        user.assert_can_login()
    assert "inactive" in exc_info.value.message


def test_active_user_can_login():
    user = User.create(
        tenant_id=_tenant_id(),
        email="g@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
    )
    assert user.can_login() is True
    user.assert_can_login()  # does not raise


# ---------------------------------------------------------------------------
# Mutators
# ---------------------------------------------------------------------------


def test_set_full_name_strips_and_bumps_updated_at():
    user = User.create(
        tenant_id=_tenant_id(),
        email="h@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
        full_name="Initial",
    )
    before = user.updated_at
    user.set_full_name("  Updated Name  ")
    assert user.full_name == "Updated Name"
    assert user.updated_at >= before


def test_set_full_name_to_none_clears_it():
    user = User.create(
        tenant_id=_tenant_id(),
        email="i@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
        full_name="Some Name",
    )
    user.set_full_name(None)
    assert user.full_name is None


def test_set_full_name_to_empty_string_clears_it():
    user = User.create(
        tenant_id=_tenant_id(),
        email="j@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
        full_name="Some Name",
    )
    user.set_full_name("   ")
    assert user.full_name is None


def test_change_role_validates_and_bumps_updated_at():
    user = User.create(
        tenant_id=_tenant_id(),
        email="k@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
    )
    before = user.updated_at
    user.change_role(Role.ADMIN)
    assert user.role is Role.ADMIN
    assert user.updated_at >= before


def test_change_role_rejects_invalid():
    user = User.create(
        tenant_id=_tenant_id(),
        email="l@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
    )
    with pytest.raises(ValidationException):
        user.change_role("superadmin")


def test_activate_deactivate_toggle():
    user = User.create(
        tenant_id=_tenant_id(),
        email="m@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
        is_active=False,
    )
    user.activate()
    assert user.is_active is True
    user.deactivate()
    assert user.is_active is False


def test_activate_when_already_active_does_not_bump_updated_at():
    user = User.create(
        tenant_id=_tenant_id(),
        email="n@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
        is_active=True,
    )
    before = user.updated_at
    user.activate()
    assert user.updated_at == before


def test_record_login_stamps_last_login():
    user = User.create(
        tenant_id=_tenant_id(),
        email="o@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
    )
    assert user.last_login is None
    now = datetime.now(UTC)
    user.record_login(now)
    assert user.last_login == now


def test_record_login_rejects_naive_datetime():
    user = User.create(
        tenant_id=_tenant_id(),
        email="p@example.com",
        hashed_password=SAMPLE_HASH,
        role=Role.MEMBER,
    )
    with pytest.raises(ValidationException):
        user.record_login(datetime.now())


# ---------------------------------------------------------------------------
# Equality
# ---------------------------------------------------------------------------


def test_users_equal_when_ids_match():
    shared = uuid.uuid4()
    a = User(id=shared, tenant_id=_tenant_id(), email="x@example.com",
             hashed_password=SAMPLE_HASH, role=Role.MEMBER)
    b = User(id=shared, tenant_id=_tenant_id(), email="y@example.com",
             hashed_password=SAMPLE_HASH, role=Role.ADMIN)
    assert a == b
    assert hash(a) == hash(b)


def test_users_usable_in_sets():
    u1 = User.create(tenant_id=_tenant_id(), email="q@example.com",
                     hashed_password=SAMPLE_HASH, role=Role.MEMBER)
    u2 = User.create(tenant_id=_tenant_id(), email="r@example.com",
                     hashed_password=SAMPLE_HASH, role=Role.MEMBER)
    s = {u1, u2, u1}  # dedupe
    assert len(s) == 2


# ---------------------------------------------------------------------------
# Role hierarchy
# ---------------------------------------------------------------------------


def test_role_hierarchy_is_strictly_ordered():
    assert Role.VIEWER.rank() < Role.MEMBER.rank() < Role.ADMIN.rank() < Role.OWNER.rank()


def test_role_can_act_as_is_transitive():
    assert Role.OWNER.can_act_as(Role.OWNER)
    assert Role.OWNER.can_act_as(Role.ADMIN)
    assert Role.OWNER.can_act_as(Role.MEMBER)
    assert Role.OWNER.can_act_as(Role.VIEWER)
    assert not Role.VIEWER.can_act_as(Role.OWNER)
    assert not Role.MEMBER.can_act_as(Role.ADMIN)
    assert Role.ADMIN.can_act_as(Role.MEMBER)
    assert not Role.MEMBER.can_act_as(Role.ADMIN)


def test_role_coercion_handles_string_in_helpers():
    # `can_act_as` is the canonical check; the string-coercion path
    # is exercised at construction time. Here we just exercise the
    # enum behavior end-to-end.
    assert Role("owner").can_act_as(Role("admin"))
