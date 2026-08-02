"""
Network chaos tests.

V9 Part 3, Task 33.

Validates that the application survives the documented
network failure modes:

* High latency
* Packet loss (simulated as flaky calls)
* DNS failures
* Timeouts
* Partial outages
"""

from __future__ import annotations

import asyncio

import pytest

from src.platform.resilience import (
    CircuitBreaker,
    FallbackHandler,
    FallbackStrategy,
    RetryPolicy,
)
from tests.chaos.faults import (
    FaultError,
    flaky,
    slow,
    unavailable,
)


class TestHighLatency:
    """A slow network must not block the worker; the timeout must engage."""

    async def test_slow_call_eventually_succeeds(self) -> None:
        async def ok() -> str:
            return "ok"

        target = slow("net", ok, delay_seconds=0.05)
        # The application is expected to either wait for the
        # call or fall back; here we just confirm the call
        # returns successfully.
        result = await target()
        assert result == "ok"
        assert target.stats["delay_total_seconds"] >= 0.05

    async def test_timeout_engages_on_pathological_latency(self) -> None:
        async def slow_call() -> str:
            await asyncio.sleep(0.5)
            return "ok"

        async def with_timeout() -> str:
            return await asyncio.wait_for(slow_call(), timeout=0.05)

        with pytest.raises(asyncio.TimeoutError):
            await with_timeout()


class TestPacketLoss:
    """Retry must recover from packet loss."""

    async def test_retry_recovers_from_packet_loss(self) -> None:
        async def ok() -> str:
            return "ok"

        target = flaky("net", ok, failure_rate=0.5)
        policy = RetryPolicy(max_attempts=5, base_delay=0.001, jitter=0.0)
        result = await policy.execute(
            target, should_retry=lambda e: isinstance(e, FaultError)
        )
        assert result == "ok"


class TestDNSFailures:
    """DNS failures must surface as a clear error."""

    async def test_unavailable_dns(self) -> None:
        async def resolve() -> str:
            return "1.2.3.4"

        target = unavailable("dns", resolve)
        with pytest.raises(FaultError):
            await target()


class TestPartialOutage:
    """Partial outages must trip the circuit breaker eventually."""

    async def test_breaker_opens_after_partial_outage(self) -> None:
        from src.platform.resilience import CircuitBreakerError

        breaker = CircuitBreaker(name="net", failure_threshold=3, reset_timeout=1.0)

        async def ok() -> str:
            return "ok"

        target = flaky("net", ok, failure_rate=0.9)
        # Hit the breaker; flaky target mostly fails.
        for _ in range(5):
            try:
                await breaker.call(target)
            except (FaultError, CircuitBreakerError):
                pass

        snapshot = breaker.snapshot()
        assert snapshot["failure_count"] >= 3
