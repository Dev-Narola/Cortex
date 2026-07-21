"""
Security primitives for the identity module.

This module is the single place that:

* hashes and verifies passwords (bcrypt)
* mints and decodes JWT access tokens (PyJWT)
* generates, hashes, and verifies API keys (bcrypt)

Per the project's hexagonal rule, the domain layer never imports from
this file directly. Application services and the auth dependencies
are the only callers.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from jwt import InvalidTokenError

from src.platform.config import settings
from src.shared.exceptions import UnauthorizedException, ValidationException


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
#
# Two kinds of constants live here, and the distinction matters:
#
# 1. Wire-protocol constants (JWT_ALGORITHM, JWT_ISSUER, JWT_AUDIENCE,
#    _API_KEY_PREFIX). These are part of the token contract — changing
#    them invalidates every outstanding token or key, so they're
#    intentionally NOT in .env. Tune by editing this file and
#    redeploying.
#
# 2. Deployment-tunable values (token lifetimes, bcrypt cost factors).
#    These are read from `Settings` (which loads from .env) and fall
#    back to safe defaults if unset. They are the ones a platform
#    operator should be able to change without a code change.
# ---------------------------------------------------------------------------


def _access_expiry() -> timedelta:
    """Access-token lifetime. Read fresh on each call so tests that
    override `Settings` at runtime see the new value without having
    to reload the module."""
    minutes = getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 30)
    return timedelta(minutes=minutes)


def _refresh_expiry() -> timedelta:
    """Refresh-token lifetime, in days."""
    days = getattr(settings, "REFRESH_TOKEN_EXPIRE_DAYS", 7)
    return timedelta(days=days)


def _password_rounds() -> int:
    return getattr(settings, "PASSWORD_BCRYPT_ROUNDS", 12)


def _api_key_rounds() -> int:
    return getattr(settings, "API_KEY_BCRYPT_ROUNDS", 10)


# JWT constants live here so application services and the auth
# dependency can share the same values without each re-reading config.
JWT_ALGORITHM: str = "HS256"
JWT_ISSUER: str = "cortex"
JWT_AUDIENCE: str = "cortex-api"


def jwt_default_expiry() -> timedelta:
    """Access-token lifetime, computed at call time from settings."""
    return _access_expiry()


def jwt_refresh_expiry() -> timedelta:
    """Refresh-token lifetime, computed at call time from settings."""
    return _refresh_expiry()


# Backwards-compat aliases — these are computed once at import
# (using the current Settings), so tests that mutate Settings at
# runtime should call `jwt_default_expiry()` / `jwt_refresh_expiry()`
# directly to get fresh values.
JWT_DEFAULT_EXPIRY: timedelta = _access_expiry()
JWT_REFRESH_EXPIRY: timedelta = _refresh_expiry()

# API keys are prefixed so a leaked value can be identified at a
# glance and so we can rotate the prefix without breaking bcrypt
# verification (the hash is prefix-agnostic).
_API_KEY_PREFIX: str = "ctx_"
_API_KEY_RAW_BYTES: int = 32  # 32 bytes -> 43 base64url chars after the prefix


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------


def hash_password(plain_password: str) -> str:
    """
    Hash a plaintext password using bcrypt.

    The cost factor is taken from `settings.PASSWORD_BCRYPT_ROUNDS` if
    set, otherwise defaults to 12 (a sensible 2026 default). The
    resulting string is the standard bcrypt hash that includes the
    algorithm version, cost, salt, and digest.
    """
    if not isinstance(plain_password, str) or not plain_password:
        raise ValidationException(
            message="Password must be a non-empty string.",
            code=400,
            data={"field": "password"},
        )
    salt = bcrypt.gensalt(rounds=_password_rounds())
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Return True iff `plain_password` matches `hashed_password`.

    Never raises on a wrong password — returns False. Only raises
    `ValidationException` if the inputs are clearly malformed (so
    callers can distinguish "user got the password wrong" from
    "this isn't even a hash").
    """
    if not isinstance(plain_password, str) or not plain_password:
        raise ValidationException(
            message="Password must be a non-empty string.",
            code=400,
            data={"field": "password"},
        )
    if not isinstance(hashed_password, str) or not hashed_password:
        raise ValidationException(
            message="Hashed password is required.",
            code=400,
            data={"field": "password"},
        )
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except ValueError:
        # `hashed_password` isn't a valid bcrypt hash at all.
        return False


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------


def _secret() -> str:
    """Resolve the JWT signing secret with a safe-development fallback."""
    secret = getattr(settings, "SECRET_KEY", None) or "change-me-in-development"
    return secret


def create_access_token(
    subject: str,
    *,
    extra_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
    token_type: str = "access",
) -> str:
    """
    Mint a signed JWT.

    `subject` is the principal the token represents (typically a
    user id, or `"user:<id>"`). `extra_claims` are merged into the
    payload — useful for embedding `tenant_id`, `role`, etc. so the
    auth dependency doesn't have to hit the database on every
    request.

    Returns the encoded JWT string.
    """
    if not subject:
        raise ValidationException(
            message="Token subject is required.",
            code=400,
            data={"field": "subject"},
        )
    now = datetime.now(timezone.utc)
    expires_at = now + (expires_delta or jwt_default_expiry())
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "typ": token_type,
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(
    subject: str,
    *,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Mint a long-lived refresh token (typ=refresh)."""
    return create_access_token(
        subject,
        extra_claims=extra_claims,
        expires_delta=JWT_REFRESH_EXPIRY,
        token_type="refresh",
    )


def decode_access_token(
    token: str,
    *,
    expected_type: str = "access",
) -> dict[str, Any]:
    """
    Decode and verify a JWT.

    Returns the claims dict on success. Raises
    `UnauthorizedException` if the token is invalid, expired, or of
    the wrong type.
    """
    if not token or not isinstance(token, str):
        raise UnauthorizedException(
            message="Authorization token is missing.",
            code=401,
            data={"field": "token"},
        )
    try:
        claims = jwt.decode(
            token,
            _secret(),
            algorithms=[JWT_ALGORITHM],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
        )
    except InvalidTokenError as exc:
        raise UnauthorizedException(
            message=f"Invalid or expired token: {exc}",
            code=401,
            data={"field": "token"},
        ) from exc

    if claims.get("typ") != expected_type:
        raise UnauthorizedException(
            message=(
                f"Token of type '{claims.get('typ')}' cannot be used where "
                f"'{expected_type}' is required."
            ),
            code=401,
            data={"field": "token", "expected_type": expected_type},
        )
    return claims


# ---------------------------------------------------------------------------
# API keys
# ---------------------------------------------------------------------------


def generate_api_key() -> str:
    """
    Generate a fresh, prefix-tagged, cryptographically random API key.

    The raw value is what gets returned to the caller *once* at
    creation time. It is never logged, never stored, and never
    recoverable. The persistence layer stores the bcrypt hash.
    """
    return _API_KEY_PREFIX + secrets.token_urlsafe(_API_KEY_RAW_BYTES)


def hash_api_key(raw_key: str) -> str:
    """Bcrypt-hash a raw API key. Same algorithm used for passwords."""
    if not isinstance(raw_key, str) or not raw_key:
        raise ValidationException(
            message="API key must be a non-empty string.",
            code=400,
            data={"field": "api_key"},
        )
    salt = bcrypt.gensalt(rounds=_api_key_rounds())
    return bcrypt.hashpw(raw_key.encode("utf-8"), salt).decode("utf-8")


def verify_api_key(raw_key: str, hashed_key: str) -> bool:
    """
    Return True iff `raw_key` matches `hashed_key`. Never raises on
    a wrong key (returns False). Raises only on clearly malformed
    input.
    """
    if not isinstance(raw_key, str) or not raw_key:
        raise ValidationException(
            message="API key must be a non-empty string.",
            code=400,
            data={"field": "api_key"},
        )
    if not isinstance(hashed_key, str) or not hashed_key:
        raise ValidationException(
            message="Hashed API key is required.",
            code=400,
            data={"field": "api_key"},
        )
    try:
        return bcrypt.checkpw(
            raw_key.encode("utf-8"), hashed_key.encode("utf-8")
        )
    except ValueError:
        return False


__all__ = [
    "JWT_ALGORITHM",
    "JWT_AUDIENCE",
    "JWT_DEFAULT_EXPIRY",
    "JWT_ISSUER",
    "JWT_REFRESH_EXPIRY",
    "create_access_token",
    "create_refresh_token",
    "decode_access_token",
    "generate_api_key",
    "hash_api_key",
    "hash_password",
    "verify_api_key",
    "verify_password",
]
