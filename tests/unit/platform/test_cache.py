"""Tests for CacheInvalidationService + MultiLevelCache."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest

from src.platform.cache import (
    CacheInvalidationError,
    CacheInvalidationService,
    InvalidationReason,
    MultiLevelCache,
)


class _FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.scan_calls = 0

    async def delete(self, *names: str) -> int:
        deleted = 0
        for name in names:
            if name in self.store:
                del self.store[name]
                deleted += 1
        return deleted

    async def keys(self, pattern: str) -> list[str]:
        prefix = pattern.replace("*", "")
        return [k for k in self.store if k.startswith(prefix)]

    async def scan_iter(self, match: str | None = None, count: int | None = None):
        self.scan_calls += 1
        prefix = (match or "").replace("*", "")
        for key in list(self.store):
            if key.startswith(prefix):
                yield key

    # Used by MultiLevelCache
    async def get(self, name: str) -> Any:
        return self.store.get(name)

    async def set(self, name: str, value: str, *, ex: int | None = None) -> Any:
        self.store[name] = value
        return True


class TestInvalidation:
    async def test_invalidate_requires_tenant_prefix(self) -> None:
        svc = CacheInvalidationService(_FakeRedis())
        tenant = uuid4()
        with pytest.raises(CacheInvalidationError):
            await svc.invalidate(tenant, f"other-tenant:key")

    async def test_invalidate_tenant_uses_scan(self) -> None:
        redis = _FakeRedis()
        tenant = uuid4()
        redis.store[f"cortex:{tenant}:k1"] = "v"
        redis.store[f"cortex:{tenant}:k2"] = "v"
        redis.store[f"cortex:other-tenant:k3"] = "v"
        svc = CacheInvalidationService(redis)
        deleted = await svc.invalidate_tenant(tenant)
        assert deleted == 2
        assert f"cortex:other-tenant:k3" in redis.store
        assert redis.scan_calls >= 1

    async def test_invalidate_pattern_caps_keys(self) -> None:
        redis = _FakeRedis()
        tenant = uuid4()
        for i in range(15):
            redis.store[f"cortex:{tenant}:k{i}"] = "v"
        svc = CacheInvalidationService(redis, max_keys_per_invalidation=5)
        with pytest.raises(CacheInvalidationError):
            await svc.invalidate_pattern(tenant, "*")

    async def test_invalidations_are_audited(self) -> None:
        redis = _FakeRedis()
        tenant = uuid4()
        redis.store[f"cortex:{tenant}:k1"] = "v"
        svc = CacheInvalidationService(redis)
        await svc.invalidate(tenant, f"cortex:{tenant}:k1", reason=InvalidationReason.WRITE, actor="test")
        events = svc.recent_events()
        assert len(events) == 1
        assert events[0].reason is InvalidationReason.WRITE
        assert events[0].keys_deleted == 1


class TestMultiLevelCache:
    async def test_get_returns_loaded_value_and_records_l1_hit(self) -> None:
        redis = _FakeRedis()
        cache = MultiLevelCache(redis, l1_max_entries=4, l1_default_ttl_seconds=10.0)
        tenant = uuid4()

        async def loader():
            return "value"

        v1 = await cache.get(tenant, "key", loader=loader)
        v2 = await cache.get(tenant, "key", loader=loader)
        assert v1 == v2 == "value"
        m = cache.metrics()
        assert m["loads"] == 1
        assert m["l1_hits"] >= 1

    async def test_delete_removes_from_both_levels(self) -> None:
        redis = _FakeRedis()
        cache = MultiLevelCache(redis, l1_default_ttl_seconds=10.0)
        tenant = uuid4()
        await cache.set(tenant, "k", "v")
        deleted = await cache.delete(tenant, "k")
        assert deleted == 1
