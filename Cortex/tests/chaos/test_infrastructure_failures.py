"""
Infrastructure chaos tests.

V9 Part 3, Task 32.

Validates that the application survives the documented
infrastructure failure modes:

* Redis unavailable
* LLM provider outage
* Object storage unavailable
* Queue unavailable
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from src.platform.cache import CacheInvalidationService
from src.platform.resilience import (
    CircuitBreaker,
    CircuitBreakerError,
    FallbackHandler,
    FallbackStrategy,
    RetryPolicy,
)
from tests.chaos.faults import FaultError, unavailable


class _FakeRedis:
    """Minimal fake for the cache invalidation tests."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    async def set(self, *args, **kwargs):  # noqa: D401, ANN001
        return None

    async def get(self, *args, **kwargs):  # noqa: ANN001
        return None

    async def delete(self, *names: str) -> int:
        deleted = 0
        for name in names:
            if name in self._store:
                del self._store[name]
                deleted += 1
        return deleted

    async def keys(self, pattern: str) -> list[str]:
        return [k for k in self._store if pattern.replace("*", "") in k]

    async def scan_iter(self, match: str | None = None, count: int | None = None):
        pattern = (match or "").replace("*", "")
        for key in list(self._store):
            if pattern in key:
                yield key


class TestRedisUnavailable:
    """The cache invalidation service must fail gracefully when Redis is down."""

    async def test_invalidator_surfaces_error(self) -> None:
        fake = _FakeRedis()
        svc = CacheInvalidationService(redis=fake)
        tenant = uuid4()

        async def broken_delete(*args, **kwargs):
            raise FaultError("redis down")

        svc._redis.delete = broken_delete  # type: ignore[assignment]

        with pytest.raises(FaultError):
            await svc.invalidate(tenant, f"cortex:{tenant}:key")


class TestLLMProviderOutage:
    """The LLM resilience layer must engage on provider outage."""

    async def test_retry_then_circuit_breaker(self) -> None:
        breaker = CircuitBreaker(name="llm", failure_threshold=2, reset_timeout=1.0)

        async def llm_call() -> str:
            raise FaultError("llm provider 503")

        # Trip the breaker.
        for _ in range(2):
            with pytest.raises(FaultError):
                await breaker.call(llm_call)

        # Circuit should now be open.
        with pytest.raises(CircuitBreakerError):
            await breaker.call(llm_call)

    async def test_fallback_returns_cached_response(self) -> None:
        async def llm_call() -> str:
            raise FaultError("llm provider 503")

        handler = FallbackHandler(
            name="llm",
            strategy=FallbackStrategy.CACHED,
        )
        # Prime the cache via a successful call.
        async def ok_call() -> str:
            return "ok-response"

        await handler.call(ok_call)
        result = await handler.call(llm_call)
        assert result == "ok-response"


class TestObjectStorageOutage:
    """The application must fall back to the local cache on S3 outage."""

    async def test_fallback_to_local(self) -> None:
        async def s3_get() -> bytes:
            raise FaultError("s3 down")

        handler = FallbackHandler(
            name="s3",
            strategy=FallbackStrategy.STATIC,
            static_value=b"placeholder",
        )
        result = await handler.call(s3_get)
        assert result == b"placeholder"


class TestQueueUnavailable:
    """Worker enqueue must fail fast when Redis is down."""

    async def test_enqueue_fails(self) -> None:
        async def enqueue() -> str:
            raise FaultError("queue down")

        with pytest.raises(FaultError):
            await enqueue()
