"""
Unit tests for the ApiKey domain entity.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from src.identity.domain.entities import ApiKey
from src.identity.infrastructure.security import hash_api_key
from src.shared.exceptions import UnauthorizedException, ValidationException

SAMPLE_HASH = hash_api_key("ctx_test_raw_key_value")


def _tenant_id() -> uuid.UUID:
    return uuid.uuid4()


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_create_api_key_with_minimal_fields():
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="CI pipeline",
        key_hash=SAMPLE_HASH,
    )
    assert key.name == "CI pipeline"
    assert key.scopes == []
    assert key.revoked_at is None
    assert key.last_used_at is None
    assert isinstance(key.id, uuid.UUID)


def test_create_api_key_with_scopes():
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="Staging",
        key_hash=SAMPLE_HASH,
        scopes=["documents:read", "search:read"],
    )
    assert key.scopes == ["documents:read", "search:read"]


def test_scopes_list_is_copied_not_aliased():
    scopes = ["a", "b"]
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="k",
        key_hash=SAMPLE_HASH,
        scopes=scopes,
    )
    scopes.append("c")
    assert key.scopes == ["a", "b"]


# ---------------------------------------------------------------------------
# Business rules
# ---------------------------------------------------------------------------


def test_api_key_rejects_raw_key():
    """The entity must never accept a raw API key — only a hash."""
    with pytest.raises(ValidationException) as exc_info:
        ApiKey.create(
            tenant_id=_tenant_id(),
            name="Bad",
            key_hash="ctx_plaintext_value",
        )
    assert "bcrypt hash" in exc_info.value.message


def test_empty_name_rejected():
    with pytest.raises(ValidationException):
        ApiKey.create(
            tenant_id=_tenant_id(),
            name="",
            key_hash=SAMPLE_HASH,
        )


def test_whitespace_name_rejected():
    with pytest.raises(ValidationException):
        ApiKey.create(
            tenant_id=_tenant_id(),
            name="   ",
            key_hash=SAMPLE_HASH,
        )


def test_empty_hash_rejected():
    with pytest.raises(ValidationException):
        ApiKey.create(
            tenant_id=_tenant_id(),
            name="k",
            key_hash="",
        )


def test_scopes_must_be_list_of_strings():
    with pytest.raises(ValidationException):
        ApiKey.create(
            tenant_id=_tenant_id(),
            name="k",
            key_hash=SAMPLE_HASH,
            scopes=["a", 123],  # type: ignore[list-item]
        )


def test_scopes_cannot_have_empty_strings():
    with pytest.raises(ValidationException):
        ApiKey.create(
            tenant_id=_tenant_id(),
            name="k",
            key_hash=SAMPLE_HASH,
            scopes=["a", "  "],
        )


def test_revoked_key_is_invalid():
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="k",
        key_hash=SAMPLE_HASH,
    )
    assert key.is_valid() is True
    key.revoke()
    assert key.is_valid() is False


def test_revoked_key_assert_valid_raises():
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="k",
        key_hash=SAMPLE_HASH,
    )
    key.revoke()
    with pytest.raises(UnauthorizedException) as exc_info:
        key.assert_valid()
    assert "revoked" in exc_info.value.message


def test_revoke_is_idempotent():
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="k",
        key_hash=SAMPLE_HASH,
    )
    key.revoke()
    first_revoke_at = key.revoked_at
    key.revoke()  # second time
    assert key.revoked_at == first_revoke_at


def test_revoke_rejects_naive_datetime():
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="k",
        key_hash=SAMPLE_HASH,
    )
    with pytest.raises(ValidationException):
        key.revoke(datetime.now())


# ---------------------------------------------------------------------------
# Scopes
# ---------------------------------------------------------------------------


def test_has_scope_matches_exact_scope():
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="k",
        key_hash=SAMPLE_HASH,
        scopes=["documents:read", "search:read"],
    )
    assert key.has_scope("documents:read")
    assert not key.has_scope("documents:write")


def test_wildcard_scope_grants_all():
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="k",
        key_hash=SAMPLE_HASH,
        scopes=["*"],
    )
    assert key.has_scope("anything")
    assert key.has_scope("documents:write")


def test_assert_has_scope_raises_when_missing():
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="k",
        key_hash=SAMPLE_HASH,
        scopes=["documents:read"],
    )
    with pytest.raises(UnauthorizedException) as exc_info:
        key.assert_has_scope("documents:write")
    assert "documents:write" in exc_info.value.message


# ---------------------------------------------------------------------------
# Usage tracking
# ---------------------------------------------------------------------------


def test_record_usage_stamps_last_used_at():
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="k",
        key_hash=SAMPLE_HASH,
    )
    now = datetime.now(UTC)
    key.record_usage(now)
    assert key.last_used_at == now


def test_record_usage_rejects_naive_datetime():
    key = ApiKey.create(
        tenant_id=_tenant_id(),
        name="k",
        key_hash=SAMPLE_HASH,
    )
    with pytest.raises(ValidationException):
        key.record_usage(datetime.now())


# ---------------------------------------------------------------------------
# Equality
# ---------------------------------------------------------------------------


def test_api_keys_equal_by_id():
    shared = uuid.uuid4()
    a = ApiKey(id=shared, tenant_id=_tenant_id(), name="x", key_hash=SAMPLE_HASH, scopes=[])
    b = ApiKey(id=shared, tenant_id=_tenant_id(), name="y", key_hash=SAMPLE_HASH, scopes=["*"])
    assert a == b
    assert hash(a) == hash(b)
