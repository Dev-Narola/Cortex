"""
Tests for the :class:`RateLimiter` in
:mod:`src.limits.application.service`.

The limiter is a thin Redis wrapper. The tests use an
in-memory fake that satisfies the ``RedisLike`` protocol
so the production code path is exercised without a real
Redis instance.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest

from src.limits.application.service import (
    PlatformDefaults,
    RateLimitExceeded,
    RateLimiter,
)


class _FakeRedis:
    """In-memory stand-in for the Redis interface the limiter needs."""

    def __init__(self) -> None:
        self._data: dict[str, int] = {}
        self._ttls: dict[str, int] = {}

    async def incr(self, name: str) -> int:
        self._data[name] = self._data.get(name, 0) + 1
        return self._data[name]

    async def incrby(self, name: str, amount: int) -> int:
        self._data[name] = self._data.get(name, 0) + int(amount)
        return self._data[name]

    async def expire(self, name: str, time: int) -> bool:
        self._ttls[name] = time
        return True

    async def get(self, name: str):
        return self._data.get(name)

    async def set(self, name: str, value, ex=None):
        self._data[name] = int(value)
        return True


@pytest.fixture
def redis():
    return _FakeRedis()


@pytest.fixture
def limiter(redis):
    return RateLimiter(
        redis,
        defaults=PlatformDefaults(
            requests_per_minute=3,
            token_limit=100,
            agent_execution_limit=2,
        ),
    )


@pytest.mark.asyncio
async def test_rpm_caps_at_limit(limiter):
    tid = uuid.uuid4()
    # First 3 calls pass, the 4th trips.
    for _ in range(3):
        await limiter.check_rpm(tenant_id=tid)
    with pytest.raises(RateLimitExceeded) as exc_info:
        await limiter.check_rpm(tenant_id=tid)
    assert exc_info.value.kind == "requests_per_minute"
    assert exc_info.value.limit == 3
    assert exc_info.value.current == 4


@pytest.mark.asyncio
async def test_tokens_cumulative_cap(limiter):
    tid = uuid.uuid4()
    # Add tokens up to the cap; the call that would
    # exceed it raises.
    await limiter.check_tokens(tenant_id=tid, tokens=80)
    await limiter.check_tokens(tenant_id=tid, tokens=10)
    with pytest.raises(RateLimitExceeded) as exc_info:
        await limiter.check_tokens(tenant_id=tid, tokens=20)
    assert exc_info.value.kind == "token_limit"


@pytest.mark.asyncio
async def test_agent_execution_caps_at_limit(limiter):
    tid = uuid.uuid4()
    await limiter.check_agent_execution(tenant_id=tid)
    await limiter.check_agent_execution(tenant_id=tid)
    with pytest.raises(RateLimitExceeded) as exc_info:
        await limiter.check_agent_execution(tenant_id=tid)
    assert exc_info.value.kind == "agent_execution_limit"


@pytest.mark.asyncio
async def test_tenants_have_independent_counters(limiter):
    a, b = uuid.uuid4(), uuid.uuid4()
    # Tenant A burns its budget; tenant B is unaffected.
    for _ in range(3):
        await limiter.check_rpm(tenant_id=a)
    with pytest.raises(RateLimitExceeded):
        await limiter.check_rpm(tenant_id=a)
    # B is fine.
    await limiter.check_rpm(tenant_id=b)
    await limiter.check_rpm(tenant_id=b)
    await limiter.check_rpm(tenant_id=b)


@pytest.mark.asyncio
async def test_current_usage_reports_all_counters(limiter, redis):
    tid = uuid.uuid4()
    await limiter.check_rpm(tenant_id=tid)
    await limiter.check_agent_execution(tenant_id=tid)
    usage = await limiter.current_usage(tenant_id=tid)
    assert usage["rpm"] == 1
    assert usage["agent_hour"] == 1
    # Token counter is keyed by month — should be 0
    # (we haven't called check_tokens yet).
    assert usage["tokens_month"] == 0
