"""
Refresh-token denylist (logout).

Refresh tokens are stateless JWTs, so revoking one means remembering it until
it would have expired anyway. Only a SHA-256 of the token is stored, with the
token's remaining lifetime as TTL, so the set never outgrows live tokens.

Reads fail open when Redis is unreachable (same policy as rate limits: a cache
outage must not sign everyone out); writes raise so logout can report it.
"""

from __future__ import annotations

import hashlib
import logging
import time

import redis

from src.core.config import settings

logger = logging.getLogger(__name__)

_client: redis.Redis | None = None


def _redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(
            settings.REDIS_URL, socket_timeout=0.5, socket_connect_timeout=0.5
        )
    return _client


def _key(token: str) -> str:
    return "cortex:auth:revoked:" + hashlib.sha256(token.encode()).hexdigest()


def revoke(token: str, *, expires_at: int) -> None:
    """Deny `token` until its `exp`. Raises `redis.RedisError` if Redis is down."""
    ttl = int(expires_at - time.time())
    if ttl > 0:
        _redis().set(_key(token), b"1", ex=ttl)


def is_revoked(token: str) -> bool:
    try:
        return bool(_redis().exists(_key(token)))
    except redis.RedisError as exc:
        logger.warning("token_denylist.redis_unavailable error=%s", exc)
        return False
