import redis.asyncio as redis

from .config import settings

ConnectionPool = redis.ConnectionPool

_redis_client: redis.Redis | None = None
_redis_pool: redis.ConnectionPool | None = None
_pool: redis.ConnectionPool | None = None
redis_client_instance: redis.Redis | None = None


def get_redis_url() -> str:
    return settings.REDIS_URL


async def init_redis() -> None:
    global _pool, _redis_client, _redis_pool, redis_client_instance

    url = get_redis_url()
    _redis_pool = redis.ConnectionPool.from_url(
        url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
        retry_on_timeout=True,
        health_check_interval=30,
    )
    _pool = _redis_pool
    _redis_client = redis.Redis(connection_pool=_redis_pool)
    await _redis_client.ping()
    redis_client_instance = _redis_client


async def close_redis() -> None:
    global _pool, _redis_client, _redis_pool, redis_client_instance

    if _redis_client is not None:
        await _redis_client.aclose()
    pool = _pool or _redis_pool
    if pool is not None:
        await pool.disconnect()
    _redis_client = None
    _redis_pool = None
    _pool = None
    redis_client_instance = None


async def get_redis() -> redis.Redis:
    """Return the initialized Redis client for FastAPI dependencies."""
    if _redis_client is None:
        raise RuntimeError("Redis not initialized")
    return _redis_client


def get_redis_client() -> redis.Redis | None:
    """Return the Redis client if it is initialized."""
    return _redis_client


async def ping() -> bool:
    """Return True when Redis accepts a PING."""
    if _redis_client is None:
        return False
    try:
        return bool(await _redis_client.ping())
    except Exception:
        return False
