"""
``MultiLevelCache`` — L1 (process) + L2 (Redis) cache wrapper.

V9 Part 2, Task 17.

The wrapper transparently looks up the L1 cache first, then
the L2 cache, then falls back to the supplied loader. On a
hit at L2, the wrapper back-fills L1. On a write, both
levels are updated.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Protocol
from uuid import UUID


class _RedisLike(Protocol):
    async def get(self, name: str) -> Any: ...
    async def set(
        self,
        name: str,
        value: str,
        *,
        ex: int | None = None,
    ) -> Any: ...
    async def delete(self, *names: str) -> int: ...


Loader = Callable[[], Awaitable[Any]]


@dataclass
class _L1Entry:
    value: Any
    expires_at: float


class MultiLevelCache:
    """L1 (process) + L2 (Redis) cache with bounded LRU."""

    def __init__(
        self,
        redis: _RedisLike,
        *,
        l1_max_entries: int = 1024,
        l1_default_ttl_seconds: float = 30.0,
    ) -> None:
        self._redis = redis
        self._l1_max_entries = l1_max_entries
        self._l1_ttl = l1_default_ttl_seconds
        self._l1: OrderedDict[str, _L1Entry] = OrderedDict()
        self._lock = asyncio.Lock()
        # Lightweight counters for observability.
        self.hits_l1 = 0
        self.hits_l2 = 0
        self.misses = 0
        self.loads = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def get(
        self,
        tenant_id: UUID,
        key: str,
        loader: Loader | None = None,
        *,
        ttl_seconds: float | None = None,
    ) -> Any | None:
        """Return the cached value or fall back to ``loader``.

        ``loader`` is called at most once per call; the result
        is stored at L1 and L2 with the supplied TTL.
        """
        full_key = self._full_key(tenant_id, key)
        now = time.monotonic()
        async with self._lock:
            entry = self._l1.get(full_key)
            if entry is not None and entry.expires_at > now:
                self._l1.move_to_end(full_key)
                self.hits_l1 += 1
                return entry.value
            if entry is not None:
                # Expired; drop it.
                self._l1.pop(full_key, None)
        raw = await self._redis.get(full_key)
        if raw is not None:
            self.hits_l2 += 1
            await self._set_l1(full_key, raw, ttl_seconds or self._l1_ttl)
            return raw
        if loader is None:
            self.misses += 1
            return None
        self.loads += 1
        value = await loader()
        await self.set(tenant_id, key, value, ttl_seconds=ttl_seconds)
        return value

    async def set(
        self,
        tenant_id: UUID,
        key: str,
        value: Any,
        *,
        ttl_seconds: float | None = None,
    ) -> None:
        full_key = self._full_key(tenant_id, key)
        ttl = int(ttl_seconds or self._l1_ttl)
        await self._redis.set(full_key, value, ex=ttl)
        await self._set_l1(full_key, value, ttl)

    async def delete(self, tenant_id: UUID, key: str) -> int:
        full_key = self._full_key(tenant_id, key)
        async with self._lock:
            self._l1.pop(full_key, None)
        return int(await self._redis.delete(full_key))

    def metrics(self) -> dict[str, int]:
        return {
            "l1_hits": self.hits_l1,
            "l2_hits": self.hits_l2,
            "misses": self.misses,
            "loads": self.loads,
            "l1_size": len(self._l1),
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    @staticmethod
    def _full_key(tenant_id: UUID, key: str) -> str:
        if not key:
            raise ValueError("key must be non-empty")
        return f"cortex:{tenant_id}:{key}"

    async def _set_l1(self, full_key: str, value: Any, ttl_seconds: float) -> None:
        async with self._lock:
            self._l1[full_key] = _L1Entry(
                value=value,
                expires_at=time.monotonic() + ttl_seconds,
            )
            self._l1.move_to_end(full_key)
            while len(self._l1) > self._l1_max_entries:
                self._l1.popitem(last=False)
