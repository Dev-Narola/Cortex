"""Tests for RetryPolicy + CircuitBreaker + FallbackHandler."""

from __future__ import annotations

import asyncio

import pytest

from src.platform.resilience import (
    CircuitBreaker,
    CircuitBreakerError,
    FallbackHandler,
    FallbackStrategy,
    RetryError,
    RetryPolicy,
    RetryStrategy,
)


class TestRetryPolicy:
    async def test_retry_recovers(self) -> None:
        policy = RetryPolicy(max_attempts=3, base_delay=0.001, jitter=0.0)
        calls = []

        async def flaky() -> str:
            calls.append(1)
            if len(calls) < 2:
                raise RuntimeError("boom")
            return "ok"

        result = await policy.execute(flaky, should_retry=lambda e: True)
        assert result == "ok"
        assert len(calls) == 2

    async def test_retry_exhausts(self) -> None:
        policy = RetryPolicy(max_attempts=3, base_delay=0.001, jitter=0.0)

        async def always_fails() -> str:
            raise RuntimeError("boom")

        with pytest.raises(RetryError):
            await policy.execute(always_fails, should_retry=lambda e: True)

    async def test_should_retry_false_raises_immediately(self) -> None:
        policy = RetryPolicy(max_attempts=3, base_delay=0.001, jitter=0.0)
        calls = 0

        async def fails() -> str:
            nonlocal calls
            calls += 1
            raise ValueError("permanent")

        with pytest.raises(ValueError):
            await policy.execute(fails, should_retry=lambda e: False)
        assert calls == 1

    async def test_delay_for_capped(self) -> None:
        policy = RetryPolicy(max_attempts=10, base_delay=1.0, max_delay=5.0, jitter=0.0)
        assert policy.delay_for(0) == 0.0
        assert policy.delay_for(1) == 1.0
        assert policy.delay_for(2) == 2.0
        assert policy.delay_for(10) == 5.0

    async def test_linear_strategy(self) -> None:
        policy = RetryPolicy(
            max_attempts=5,
            base_delay=1.0,
            jitter=0.0,
            strategy=RetryStrategy.LINEAR,
        )
        assert policy.delay_for(1) == 1.0
        assert policy.delay_for(3) == 3.0

    async def test_constant_strategy(self) -> None:
        policy = RetryPolicy(
            max_attempts=5,
            base_delay=1.0,
            jitter=0.0,
            strategy=RetryStrategy.CONSTANT,
        )
        assert policy.delay_for(3) == 1.0


class TestCircuitBreaker:
    async def test_breaker_opens_after_threshold(self) -> None:
        breaker = CircuitBreaker(name="x", failure_threshold=2, reset_timeout=10.0)

        async def fails() -> str:
            raise RuntimeError("boom")

        for _ in range(2):
            with pytest.raises(RuntimeError):
                await breaker.call(fails)

        with pytest.raises(CircuitBreakerError):
            await breaker.call(fails)

    async def test_breaker_half_open_then_closed(self) -> None:
        breaker = CircuitBreaker(name="x", failure_threshold=2, reset_timeout=0.0)

        async def fails() -> str:
            raise RuntimeError("boom")

        for _ in range(2):
            with pytest.raises(RuntimeError):
                await breaker.call(fails)

        # reset_timeout=0 means the breaker is immediately eligible for half-open.
        async def ok() -> str:
            return "ok"

        result = await breaker.call(ok)
        assert result == "ok"
        assert breaker.state.value == "closed"

    async def test_snapshot(self) -> None:
        breaker = CircuitBreaker(name="x", failure_threshold=2)
        snap = breaker.snapshot()
        assert snap["name"] == "x"
        assert snap["state"] == "closed"


class TestFallbackHandler:
    async def test_static_fallback(self) -> None:
        handler = FallbackHandler(
            name="x",
            strategy=FallbackStrategy.STATIC,
            static_value="degraded",
        )

        async def fails() -> str:
            raise RuntimeError("boom")

        assert await handler.call(fails) == "degraded"
        assert handler.trigger_count == 1

    async def test_cached_fallback(self) -> None:
        handler = FallbackHandler(name="x", strategy=FallbackStrategy.CACHED)

        async def ok() -> str:
            return "first"

        async def fails() -> str:
            raise RuntimeError("boom")

        await handler.call(ok)
        assert await handler.call(fails) == "first"

    async def test_computed_fallback(self) -> None:
        async def fb(exc: BaseException) -> str:
            return f"recovered: {exc}"

        handler = FallbackHandler(name="x", strategy=FallbackStrategy.COMPUTED, fallback=fb)

        async def fails() -> str:
            raise RuntimeError("boom")

        result = await handler.call(fails)
        assert result == "recovered: boom"
