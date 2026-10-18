"""
Per-request rate limits: per tenant, per API key, and login attempts
(FR-AUTH-02, FR-BILL-02).

Called from the (sync) auth dependencies, which already know the tenant
and key, so limiting costs one Redis round-trip and no extra DB lookup
beyond the optional ``tenant_limits`` override row.

Fixed one-minute windows (``INCR`` + ``EXPIRE``). Fails open when Redis is
unreachable: a cache outage must not become an API outage; the readiness
probe already reports Redis down.
"""

from __future__ import annotations

import logging
import time

import redis
from fastapi import HTTPException, status

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


def enforce(scope: str, ident: str, limit: int) -> None:
    """Count one request for ``scope:ident``; raise 429 above ``limit``/minute."""
    if limit <= 0:
        return
    now = time.time()
    key = f"cortex:rl:req:{scope}:{ident}:{int(now // 60)}"
    try:
        pipe = _redis().pipeline()
        pipe.incr(key)
        pipe.expire(key, 61)
        count = int(pipe.execute()[0])
    except redis.RedisError as exc:
        logger.warning("rate_limit.redis_unavailable scope=%s error=%s", scope, exc)
        return
    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "message": f"Rate limit exceeded ({limit} requests/minute for {scope}).",
                "code": 429,
                "data": {"scope": scope, "limit": limit},
            },
            headers={"Retry-After": str(max(1, 60 - int(now) % 60))},
        )


def tenant_limit(db, tenant_id) -> int:
    """The tenant's override from ``tenant_limits`` or the platform default."""
    from src.limits.infrastructure.models import TenantLimitsModel

    row = db.query(TenantLimitsModel.requests_per_minute).filter(
        TenantLimitsModel.tenant_id == tenant_id
    ).one_or_none()
    return int(row[0]) if row is not None else settings.TENANT_REQUESTS_PER_MINUTE


def enforce_tenant(db, tenant_id) -> None:
    enforce("tenant", str(tenant_id), tenant_limit(db, tenant_id))


def enforce_api_key(db, api_key, tenant_id) -> None:
    enforce("key", str(api_key.id), api_key.rate_limit_per_min or settings.API_KEY_REQUESTS_PER_MINUTE)
    enforce_tenant(db, tenant_id)


__all__ = ["enforce", "enforce_api_key", "enforce_tenant", "tenant_limit"]
