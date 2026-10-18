import json
from typing import Any, Optional

from src.core.redis_client import get_redis


async def get_cache(key: str) -> Optional[Any]:
    """Retrieve and deserialize a JSON value from Redis."""
    redis = await get_redis()
    val = await redis.get(key)
    if val:
        return json.loads(val)
    return None


async def set_cache(key: str, value: Any, ttl_seconds: int = 60) -> None:
    """Serialize and store a value in Redis with a TTL."""
    redis = await get_redis()
    await redis.set(key, json.dumps(value), ex=ttl_seconds)


def _search_version_key(tenant_id) -> str:
    return f"search_version:{tenant_id}"


async def get_search_version(tenant_id) -> int:
    """Per-tenant search-cache generation (0 if Redis is unavailable)."""
    try:
        redis = await get_redis()
        return int(await redis.get(_search_version_key(tenant_id)) or 0)
    except Exception:  # noqa: BLE001 - cache is best-effort
        return 0


async def bump_search_version(tenant_id) -> None:
    """Invalidate every cached search result of a tenant in O(1)."""
    try:
        redis = await get_redis()
        await redis.incr(_search_version_key(tenant_id))
    except Exception:  # noqa: BLE001 - worst case: results stay cached until TTL
        pass


async def invalidate_cache(key: str) -> None:
    """Delete a key from Redis."""
    redis = await get_redis()
    await redis.delete(key)
