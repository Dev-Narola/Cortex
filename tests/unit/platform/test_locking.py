"""Tests for DistributedLockService."""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

import pytest

from src.platform.locking import (
    DistributedLock,
    DistributedLockLostError,
    DistributedLockNotAcquiredError,
    DistributedLockService,
)


class _FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def set(self, name: str, value: str, *, nx: bool = False, px: int | None = None) -> Any:
        if nx and name in self.store:
            return None
        self.store[name] = value
        return True

    async def eval(self, script: str, numkeys: int, *args: Any) -> Any:
        if "del" in script:
            key = args[0]
            token = args[1]
            if self.store.get(key) == token:
                del self.store[key]
                return 1
            return 0
        if "pexpire" in script:
            key = args[0]
            token = args[1]
            if self.store.get(key) == token:
                return 1
            return 0
        return 0

    async def exists(self, name: str) -> int:
        return 1 if name in self.store else 0

    async def delete(self, name: str) -> int:
        if name in self.store:
            del self.store[name]
            return 1
        return 0


class TestAcquireRelease:
    async def test_acquire_and_release(self) -> None:
        redis = _FakeRedis()
        svc = DistributedLockService(redis, default_ttl_seconds=10.0)
        lock = await svc.acquire("test")
        assert lock.name == "test"
        assert lock.token
        assert await svc.exists("test")
        ok = await svc.release(lock)
        assert ok is True
        assert not await svc.exists("test")

    async def test_release_only_by_owner(self) -> None:
        redis = _FakeRedis()
        svc = DistributedLockService(redis, default_ttl_seconds=10.0)
        lock = await svc.acquire("test")
        # Simulate a different caller trying to release.
        imposter = DistributedLock(
            name=lock.name,
            token="other",
            ttl_seconds=lock.ttl_seconds,
            acquired_at=time.monotonic(),
        )
        ok = await svc.release(imposter)
        assert ok is False
        assert await svc.exists("test")
        # Real owner can still release.
        ok = await svc.release(lock)
        assert ok is True

    async def test_acquire_timeout_raises(self) -> None:
        redis = _FakeRedis()
        svc = DistributedLockService(redis, default_ttl_seconds=10.0, default_acquire_timeout_seconds=0.1)
        lock = await svc.acquire("test")
        with pytest.raises(DistributedLockNotAcquiredError):
            await svc.acquire("test", acquire_timeout_seconds=0.1)
        await svc.release(lock)


class TestRenew:
    async def test_renew_succeeds_for_owner(self) -> None:
        redis = _FakeRedis()
        svc = DistributedLockService(redis, default_ttl_seconds=10.0)
        lock = await svc.acquire("test")
        ok = await svc.renew(lock, ttl_seconds=30.0)
        assert ok is True

    async def test_renew_fails_for_non_owner(self) -> None:
        redis = _FakeRedis()
        svc = DistributedLockService(redis, default_ttl_seconds=10.0)
        lock = await svc.acquire("test")
        imposter = DistributedLock(
            name=lock.name,
            token="other",
            ttl_seconds=lock.ttl_seconds,
            acquired_at=time.monotonic(),
        )
        with pytest.raises(DistributedLockLostError):
            await svc.renew(imposter, ttl_seconds=30.0)


class TestGuard:
    async def test_guard_releases_on_exit(self) -> None:
        redis = _FakeRedis()
        svc = DistributedLockService(redis, default_ttl_seconds=10.0)

        @asynccontextmanager
        async def use_lock():
            async with svc.guard("test"):
                assert await svc.exists("test")
            yield

        async with use_lock():
            pass
        assert not await svc.exists("test")

    async def test_guard_releases_even_on_exception(self) -> None:
        redis = _FakeRedis()
        svc = DistributedLockService(redis, default_ttl_seconds=10.0)
        with pytest.raises(RuntimeError):
            async with svc.guard("test"):
                assert await svc.exists("test")
                raise RuntimeError("boom")
        assert not await svc.exists("test")
