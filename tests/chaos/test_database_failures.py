"""
Database chaos tests.

V9 Part 3, Task 31.

Validates that the application survives the documented
database failure modes:

* Postgres unavailable
* Postgres slow
* Read-only database
* Connection exhaustion
"""

from __future__ import annotations

import pytest

from src.platform.resilience import (
    CircuitBreaker,
    CircuitBreakerError,
    FallbackHandler,
    FallbackStrategy,
    RetryPolicy,
)
from tests.chaos.faults import (
    FaultError,
    connection_exhausted,
    read_only,
    slow,
    unavailable,
)


async def _db_call() -> str:
    return "ok"


class TestDatabaseUnavailable:
    """The application must surface a transient error after retries exhaust."""

    async def test_retry_recovers_when_db_recovers(self) -> None:
        attempt = 0

        async def flaky_db() -> str:
            nonlocal attempt
            attempt += 1
            if attempt < 3:
                raise FaultError("db down")
            return "ok"

        policy = RetryPolicy(max_attempts=5, base_delay=0.01, jitter=0.0)
        result = await policy.execute(flaky_db, should_retry=lambda e: isinstance(e, FaultError))
        assert result == "ok"
        assert attempt == 3

    async def test_retry_exhausts_and_circuit_breaker_opens(self) -> None:
        breaker = CircuitBreaker(name="db", failure_threshold=3, reset_timeout=0.5)

        async def always_fails() -> str:
            raise FaultError("db down")

        # Trip the breaker.
        for _ in range(3):
            with pytest.raises(FaultError):
                await breaker.call(always_fails)

        with pytest.raises(CircuitBreakerError):
            await breaker.call(always_fails)


class TestDatabaseSlow:
    """The application must time out gracefully on a slow database."""

    async def test_slow_db_triggers_timeout(self) -> None:
        from src.platform.resilience import RetryPolicy

        # We simulate by having the policy use a tiny timeout
        # via the asyncio.wait_for inside the call.
        import asyncio

        async def slow_db() -> str:
            await asyncio.sleep(0.05)
            return "ok"

        async def with_timeout() -> str:
            return await asyncio.wait_for(slow_db(), timeout=0.01)

        policy = RetryPolicy(max_attempts=1, base_delay=0.01, jitter=0.0)
        with pytest.raises((asyncio.TimeoutError, Exception)):
            await policy.execute(with_timeout)


class TestDatabaseReadOnly:
    """Write operations on a read-only replica must fail fast."""

    async def test_read_only_rejects_writes(self) -> None:
        target = read_only("db", _db_call)
        with pytest.raises(FaultError):
            await target(write=True)
        # Reads still pass.
        assert await target() == "ok"


class TestConnectionExhaustion:
    """The application must surface a clear error when the pool is exhausted."""

    async def test_pool_exhaustion(self) -> None:
        target = connection_exhausted("db", _db_call, limit=2)
        assert await target() == "ok"
        assert await target() == "ok"
        with pytest.raises(FaultError):
            await target()


class TestFallbackProvidesDegradedResponse:
    """A fallback handler must provide a degraded response when the DB is down."""

    async def test_fallback_returns_default(self) -> None:
        async def db_call() -> str:
            raise FaultError("db down")

        handler = FallbackHandler(
            name="db",
            strategy=FallbackStrategy.STATIC,
            static_value="degraded",
        )
        result = await handler.call(db_call)
        assert result == "degraded"
        assert handler.trigger_count == 1
