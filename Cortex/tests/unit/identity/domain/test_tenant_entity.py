"""
Unit tests for the Tenant domain entity.

These tests are pure-Python — no DB, no network, no fixtures beyond
resetting the in-memory slug registry between tests. They cover:

* the field defaults
* each business rule the entity is required to enforce
* the lifecycle mutators (rename, change_plan, change_slug, activate, deactivate)
* equality / hashing based on identity (id)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from src.identity.domain.entities import Plan, Tenant
from src.shared.exceptions import ConflictException, ValidationException

# ---------------------------------------------------------------------------
# Test isolation: the slug registry is a class-level set. Reset it before
# every test so that order does not matter and a failure cannot leak.
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_slug_registry():
    Tenant.reset_slug_registry()
    yield
    Tenant.reset_slug_registry()


# ---------------------------------------------------------------------------
# Happy-path construction
# ---------------------------------------------------------------------------


def test_create_tenant_with_required_fields_only_defaults_plan_to_free():
    tenant = Tenant.create(name="Acme", slug="acme")

    assert tenant.name == "Acme"
    assert tenant.slug == "acme"
    assert tenant.plan is Plan.FREE
    assert tenant.is_active is True
    assert isinstance(tenant.id, uuid.UUID)
    assert isinstance(tenant.created_at, datetime)
    assert isinstance(tenant.updated_at, datetime)
    assert tenant.created_at.tzinfo is not None
    assert tenant.updated_at.tzinfo is not None


def test_create_tenant_with_explicit_plan_and_inactive_flag():
    tenant = Tenant.create(
        name="Beta Co",
        slug="beta-co",
        plan=Plan.PRO,
        is_active=False,
    )

    assert tenant.plan is Plan.PRO
    assert tenant.is_active is False


def test_slug_is_normalized_to_lowercase_and_stripped():
    tenant = Tenant.create(name="Gamma", slug="  Gamma-Corp  ")

    assert tenant.slug == "gamma-corp"


def test_name_is_stripped_of_surrounding_whitespace():
    tenant = Tenant.create(name="  Acme Corp  ", slug="acme-corp")

    assert tenant.name == "Acme Corp"


def test_each_tenant_gets_a_distinct_id():
    t1 = Tenant.create(name="A", slug="a-one")
    t2 = Tenant.create(name="A", slug="a-two")

    assert t1.id != t2.id


def test_plan_string_value_is_coerced_to_enum():
    tenant = Tenant.create(name="Delta", slug="delta", plan="enterprise")

    assert tenant.plan is Plan.ENTERPRISE


# ---------------------------------------------------------------------------
# Business rule: name cannot be empty
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_name", ["", "   ", "\t\n"])
def test_tenant_name_cannot_be_empty(bad_name):
    with pytest.raises(ValidationException) as exc_info:
        Tenant.create(name=bad_name, slug="whatever")

    assert exc_info.value.message == "Tenant name cannot be empty."
    assert exc_info.value.data == {"field": "name"}


def test_tenant_name_too_long_raises():
    long_name = "x" * (Tenant._NAME_MAX_LENGTH + 1)

    with pytest.raises(ValidationException) as exc_info:
        Tenant.create(name=long_name, slug="long-name")

    assert "cannot exceed" in exc_info.value.message
    assert exc_info.value.data["field"] == "name"


# ---------------------------------------------------------------------------
# Business rule: slug must be unique
# ---------------------------------------------------------------------------


def test_duplicate_slug_raises_conflict():
    Tenant.create(name="Acme", slug="acme")

    with pytest.raises(ConflictException) as exc_info:
        Tenant.create(name="Acme 2", slug="acme")

    assert "already in use" in exc_info.value.message
    assert exc_info.value.data == {"field": "slug", "value": "acme"}


def test_duplicate_slug_after_normalization_raises_conflict():
    Tenant.create(name="Acme", slug="acme")

    with pytest.raises(ConflictException):
        Tenant.create(name="Acme 2", slug="  ACME  ")


def test_release_slug_allows_reuse():
    Tenant.create(name="Acme", slug="acme")
    Tenant.release_slug("acme")

    # Should not raise — slug was released.
    second = Tenant.create(name="Acme Reborn", slug="acme")
    assert second.slug == "acme"


def test_seed_slug_marks_a_slug_as_taken():
    Tenant.seed_slug("seeded")

    with pytest.raises(ConflictException):
        Tenant.create(name="Z", slug="seeded")


# ---------------------------------------------------------------------------
# Business rule: slug format
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_slug",
    [
        "",
        "   ",
        "-leading-hyphen",
        "trailing-hyphen-",
        "double--hyphen",
        "with space",
        "with_underscore",
        "with.dot",
        "with/slash",
        "a",  # too short
        "a" * 64,  # too long
    ],
)
def test_invalid_slug_format_raises(bad_slug):
    with pytest.raises(ValidationException):
        Tenant.create(name="Test", slug=bad_slug)


def test_uppercase_slug_is_normalized_not_rejected():
    tenant = Tenant.create(name="Test", slug="UPPERCASE")
    assert tenant.slug == "uppercase"


@pytest.mark.parametrize(
    "good_slug",
    [
        "ab",
        "acme",
        "acme-corp",
        "a-1",
        "tenant-123",
        "1-2-3",
        "a" * 63,  # exactly max length
    ],
)
def test_valid_slug_formats_are_accepted(good_slug):
    tenant = Tenant.create(name="Test", slug=good_slug)
    assert tenant.slug == good_slug


# ---------------------------------------------------------------------------
# Plan validation
# ---------------------------------------------------------------------------


def test_invalid_plan_string_raises():
    with pytest.raises(ValidationException) as exc_info:
        Tenant.create(name="Acme", slug="acme", plan="platinum")

    assert "Invalid plan" in exc_info.value.message


# ---------------------------------------------------------------------------
# Timestamp validation
# ---------------------------------------------------------------------------


def test_naive_datetime_raises():
    with pytest.raises(ValidationException) as exc_info:
        Tenant(
            name="Acme",
            slug="acme",
            created_at=datetime.now(),  # no tzinfo
            updated_at=datetime.now(UTC),
        )

    assert "timezone-aware" in exc_info.value.message


def test_updated_at_before_created_at_raises():
    now = datetime.now(UTC)
    with pytest.raises(ValidationException) as exc_info:
        Tenant(
            name="Acme",
            slug="acme",
            created_at=now,
            updated_at=now - timedelta(seconds=1),
        )

    assert "cannot be earlier" in exc_info.value.message


# ---------------------------------------------------------------------------
# Lifecycle mutators
# ---------------------------------------------------------------------------


def test_rename_updates_name_and_bumps_updated_at():
    tenant = Tenant.create(name="Acme", slug="acme")
    before = tenant.updated_at

    tenant.rename("Acme Corporation")

    assert tenant.name == "Acme Corporation"
    assert tenant.updated_at >= before


def test_rename_validates_new_name():
    tenant = Tenant.create(name="Acme", slug="acme")

    with pytest.raises(ValidationException):
        tenant.rename("   ")

    # Original name preserved on failure.
    assert tenant.name == "Acme"


def test_change_plan_updates_and_bumps_updated_at():
    tenant = Tenant.create(name="Acme", slug="acme")
    before = tenant.updated_at

    tenant.change_plan(Plan.PRO)

    assert tenant.plan is Plan.PRO
    assert tenant.updated_at >= before


def test_change_plan_accepts_string_and_coerces():
    tenant = Tenant.create(name="Acme", slug="acme")

    tenant.change_plan("enterprise")

    assert tenant.plan is Plan.ENTERPRISE


def test_change_plan_rejects_invalid_value():
    tenant = Tenant.create(name="Acme", slug="acme")

    with pytest.raises(ValidationException):
        tenant.change_plan("platinum")


def test_change_slug_releases_old_and_reserves_new():
    tenant = Tenant.create(name="Acme", slug="acme")

    tenant.change_slug("acme-reborn")

    assert tenant.slug == "acme-reborn"
    # The old slug is free to be taken by a different tenant.
    other = Tenant.create(name="Other", slug="acme")
    assert other.slug == "acme"


def test_change_slug_to_already_taken_raises_and_preserves_old():
    Tenant.create(name="A", slug="alpha")
    tenant = Tenant.create(name="B", slug="beta")

    with pytest.raises(ConflictException):
        tenant.change_slug("alpha")

    assert tenant.slug == "beta"


def test_activate_and_deactivate_toggle_is_active():
    tenant = Tenant.create(name="Acme", slug="acme", is_active=False)
    assert tenant.is_active is False

    tenant.activate()
    assert tenant.is_active is True

    tenant.deactivate()
    assert tenant.is_active is False


def test_activate_when_already_active_is_idempotent_and_does_not_bump():
    tenant = Tenant.create(name="Acme", slug="acme", is_active=True)
    before = tenant.updated_at

    tenant.activate()

    assert tenant.is_active is True
    assert tenant.updated_at == before


# ---------------------------------------------------------------------------
# Equality / hashing
# ---------------------------------------------------------------------------


def test_tenants_are_equal_when_ids_match():
    shared_id = uuid.uuid4()
    a = Tenant(
        id=shared_id,
        name="Name A",
        slug="slug-a",
    )
    b = Tenant(
        id=shared_id,
        name="Name B",  # different name
        slug="slug-b",  # different slug
    )

    assert a == b
    assert hash(a) == hash(b)


def test_tenants_are_not_equal_when_ids_differ():
    a = Tenant.create(name="A", slug="a-one")
    b = Tenant.create(name="A", slug="a-two")

    assert a != b


def test_tenants_can_be_used_in_sets_and_dicts():
    a = Tenant.create(name="A", slug="a-one")
    b = Tenant.create(name="B", slug="b-one")
    c = Tenant.create(name="C", slug="c-one")

    tenants = {a, b, c}

    assert len(tenants) == 3
    assert a in tenants
