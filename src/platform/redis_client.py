import logging

import redis.asyncio as redis

from .config import settings

ConnectionPool = redis.ConnectionPool

logger = logging.getLogger(__name__)

_redis_client: redis.Redis | None = None
_redis_pool: redis.ConnectionPool | None = None
_pool: redis.ConnectionPool | None = None
redis_client_instance: redis.Redis | None = None


def get_redis_url() -> str:
    return settings.REDIS_URL


async def init_redis() -> None:
    """
    Initialize the shared Redis client.

    Connection failures are logged and the client is left as `None`.
    This makes the app bootable in environments where Redis is not
    yet provisioned (CI, local dev without docker, unit tests using
    `TestClient`). Endpoints that need Redis will fail at request
    time with a clear "Redis not configured" error rather than the
    whole app failing to start.
    """
    global _pool, _redis_client, _redis_pool, redis_client_instance

    url = get_redis_url()
    try:
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
    except (redis.RedisError, OSError) as exc:
        logger.warning(
            "Redis unreachable at %s (%s) — continuing without a live "
            "Redis connection. Endpoints that depend on Redis will fail "
            "at request time until the cache is brought up.",
            url,
            exc.__class__.__name__,
        )
        # Leave the globals in a clean state so subsequent
        # `get_redis()` calls correctly report "not initialized".
        if _pool is not None:
            try:
                await _pool.disconnect()
            except Exception:  # pragma: no cover - best-effort cleanup
                pass
        _redis_pool = None
        _pool = None
        _redis_client = None
        redis_client_instance = None


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
    """Return the initialized Redis client for FastAPI dependencies.

    Raises a clear runtime error if Redis is not available. Callers
    can translate that into a 503 at the route layer.
    """
    if _redis_client is None:
        raise RuntimeError(
            "Redis is not available — either the connection failed at "
            "startup, or the lifespan hook hasn't run yet."
        )
    return _redis_client


def get_redis_client() -> redis.Redis | None:
    """Return the Redis client if it is initialized."""
    return _redis_client


async def ping() -> bool:
    """Return True when Redis accepts a PING."""
    if _redis_client is None:
        return False
    try:
        return await _redis_client.ping()
    except Exception:
        return False
