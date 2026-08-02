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


async def invalidate_cache(key: str) -> None:
    """Delete a key from Redis."""
    redis = await get_redis()
    await redis.delete(key)
