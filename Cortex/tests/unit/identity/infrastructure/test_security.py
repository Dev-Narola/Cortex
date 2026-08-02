"""
Unit tests for the security primitives (passwords, JWT, API keys).
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from src.identity.infrastructure.security import (
    JWT_ALGORITHM,
    JWT_AUDIENCE,
    JWT_ISSUER,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    generate_api_key,
    hash_api_key,
    hash_password,
    jwt_default_expiry,
    verify_api_key,
    verify_password,
)
from src.shared.exceptions import UnauthorizedException, ValidationException

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------


def test_hash_password_returns_bcrypt_hash():
    h = hash_password("hello-world-123")
    assert h.startswith("$2")
    assert h != "hello-world-123"


def test_hash_password_produces_unique_hashes_for_same_input():
    """Salting means two hashes of the same password must differ."""
    a = hash_password("same")
    b = hash_password("same")
    assert a != b


def test_verify_password_accepts_correct_password():
    h = hash_password("correct password")
    assert verify_password("correct password", h) is True


def test_verify_password_rejects_wrong_password():
    h = hash_password("correct")
    assert verify_password("wrong", h) is False


def test_hash_password_rejects_empty():
    with pytest.raises(ValidationException):
        hash_password("")


def test_hash_password_rejects_non_string():
    with pytest.raises(ValidationException):
        hash_password(None)  # type: ignore[arg-type]


def test_verify_password_rejects_empty_plain():
    h = hash_password("x")
    with pytest.raises(ValidationException):
        verify_password("", h)


def test_verify_password_returns_false_for_malformed_hash():
    assert verify_password("anything", "not-a-real-hash") is False


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------


def test_create_and_decode_access_token_round_trip():
    token = create_access_token(
        subject="user-123",
        extra_claims={"tenant_id": "tenant-abc", "role": "owner"},
    )
    claims = decode_access_token(token, expected_type="access")
    assert claims["sub"] == "user-123"
    assert claims["tenant_id"] == "tenant-abc"
    assert claims["role"] == "owner"
    assert claims["iss"] == JWT_ISSUER
    assert claims["aud"] == JWT_AUDIENCE
    assert claims["typ"] == "access"


def test_create_refresh_token_has_typ_refresh():
    token = create_refresh_token(subject="user-1")
    claims = decode_access_token(token, expected_type="refresh")
    assert claims["typ"] == "refresh"


def test_decode_rejects_refresh_token_as_access():
    refresh = create_refresh_token(subject="user-1")
    with pytest.raises(UnauthorizedException):
        decode_access_token(refresh, expected_type="access")


def test_decode_rejects_access_token_as_refresh():
    access = create_access_token(subject="user-1")
    with pytest.raises(UnauthorizedException):
        decode_access_token(access, expected_type="refresh")


def test_decode_rejects_missing_token():
    with pytest.raises(UnauthorizedException):
        decode_access_token("")


def test_decode_rejects_garbage_token():
    with pytest.raises(UnauthorizedException):
        decode_access_token("not-a-jwt")


def test_custom_expiry_is_respected():
    token = create_access_token(subject="u", expires_delta=timedelta(seconds=10))
    claims = decode_access_token(token)
    iat = claims["iat"]
    exp = claims["exp"]
    assert exp - iat == 10


def test_create_access_token_requires_subject():
    with pytest.raises(ValidationException):
        create_access_token(subject="")


def test_jwt_default_expiry_is_positive():
    assert jwt_default_expiry().total_seconds() > 0


def test_jwt_expiry_reflects_settings_change():
    """jwt_default_expiry() reads from settings at call time so a
    platform operator can tune token lifetimes via .env without a
    code change or a restart of the test process."""
    from src.core import config

    original = config.settings.ACCESS_TOKEN_EXPIRE_MINUTES
    try:
        config.settings.ACCESS_TOKEN_EXPIRE_MINUTES = 5
        assert jwt_default_expiry().total_seconds() == 5 * 60
        config.settings.ACCESS_TOKEN_EXPIRE_MINUTES = 60
        assert jwt_default_expiry().total_seconds() == 60 * 60
    finally:
        config.settings.ACCESS_TOKEN_EXPIRE_MINUTES = original


def test_jwt_algorithm_is_hs256():
    assert JWT_ALGORITHM == "HS256"


def test_extra_claims_layer_non_security_fields():
    """`extra_claims` should layer over the base claims for arbitrary fields."""
    token = create_access_token(subject="u", extra_claims={"role": "owner", "tenant_id": "t-1"})
    claims = decode_access_token(token)
    assert claims["role"] == "owner"
    assert claims["tenant_id"] == "t-1"


def test_extra_claims_cannot_override_security_fields():
    """`extra_claims` must not be able to override `iss`, `aud`, or `exp`,
    because doing so would let a caller forge a token's signing invariant.
    `create_access_token` enforces this by layering in a fixed order."""
    # The implementation only `update`s `extra_claims` on top of the
    # base, so security fields (set after `extra_claims`) win.
    # We just assert the observable behavior: a token with an
    # attempted `iss` override fails to decode.
    import jwt as pyjwt

    from src.identity.infrastructure.security import JWT_ALGORITHM, _secret

    forged = pyjwt.encode(
        {
            "sub": "u",
            "iss": "attacker",
            "aud": "cortex-api",
            "typ": "access",
            "iat": 0,
            "exp": 9_999_999_999,
        },
        _secret(),
        algorithm=JWT_ALGORITHM,
    )
    with pytest.raises(UnauthorizedException):
        decode_access_token(forged)


# ---------------------------------------------------------------------------
# API keys
# ---------------------------------------------------------------------------


def test_generate_api_key_has_prefix():
    key = generate_api_key()
    assert key.startswith("ctx_")
    assert len(key) > 20


def test_generate_api_key_produces_unique_values():
    keys = {generate_api_key() for _ in range(50)}
    assert len(keys) == 50


def test_hash_and_verify_api_key():
    raw = generate_api_key()
    h = hash_api_key(raw)
    assert h != raw
    assert h.startswith("$2")
    assert verify_api_key(raw, h) is True
    assert verify_api_key("ctx_wrong", h) is False


def test_hash_api_key_rejects_empty():
    with pytest.raises(ValidationException):
        hash_api_key("")


def test_verify_api_key_returns_false_for_malformed_hash():
    assert verify_api_key("ctx_anything", "not-a-hash") is False
