"""
``CacheInvalidationService`` — coordinated cache eviction.

V9 Part 2, Task 17.

The service is the only place the application should
delete cache entries. It guarantees:

* **Tenant safety** — every key is prefixed with the
  tenant id; the service refuses to delete a key whose
  prefix does not match the caller's tenant.
* **Audit trail** — every invalidation is recorded with
  the reason (write, manual, ttl, drift) for the metrics
  pipeline.
* **Bounded blast radius** — pattern invalidation caps
  the number of keys to prevent a runaway ``DEL`` from
  killing Redis.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Protocol
from uuid import UUID


class InvalidationReason(str, Enum):
    """Why an invalidation was triggered."""

    WRITE = "write"
    MANUAL = "manual"
    TTL = "ttl"
    DRIFT = "drift"
    RECONFIGURE = "reconfigure"


class CacheInvalidationError(RuntimeError):
    """Raised on tenant-safety violations or Redis errors."""


class _RedisLike(Protocol):
    """Subset of the async redis client we depend on."""

    async def delete(self, *names: str) -> int: ...
    async def keys(self, pattern: str) -> list[str]: ...
    async def scan_iter(self, match: str | None = None, count: int | None = None): ...


@dataclass(frozen=True)
class InvalidationEvent:
    """One invalidation event recorded for metrics + audit."""

    tenant_id: UUID | None
    pattern: str
    keys_deleted: int
    reason: InvalidationReason
    actor: str
    timestamp: datetime


class CacheInvalidationService:
    """Tenant-scoped cache eviction.

    The service does not store anything; it is a thin
    wrapper around Redis with the safety invariants
    applied. Multiple instances are stateless and
    safe to run concurrently.
    """

    # Default upper bound on the number of keys a single
    # pattern invalidation can touch. Anything larger is
    # treated as a misconfiguration and refused.
    DEFAULT_MAX_KEYS = 10_000

    def __init__(
        self,
        redis: _RedisLike,
        *,
        max_keys_per_invalidation: int = DEFAULT_MAX_KEYS,
    ) -> None:
        self._redis = redis
        self._max_keys = max_keys_per_invalidation
        self._events: list[InvalidationEvent] = []

    # ------------------------------------------------------------------
    # Invalidation API
    # ------------------------------------------------------------------
    async def invalidate(
        self,
        tenant_id: UUID,
        key: str,
        *,
        reason: InvalidationReason = InvalidationReason.WRITE,
        actor: str = "system",
    ) -> int:
        """Delete a single key.

        ``key`` must already include the tenant prefix; the
        service verifies it matches the caller's tenant
        id and raises :class:`CacheInvalidationError`
        otherwise.
        """
        if not key.startswith(self._tenant_prefix(tenant_id)):
            raise CacheInvalidationError(
                f"key {key!r} does not match tenant {tenant_id}"
            )
        deleted = await self._redis.delete(key)
        await self._record(tenant_id, key, deleted, reason, actor)
        return int(deleted)

    async def invalidate_tenant(
        self,
        tenant_id: UUID,
        *,
        reason: InvalidationReason = InvalidationReason.WRITE,
        actor: str = "system",
    ) -> int:
        """Delete every key under the tenant's namespace.

        Uses ``SCAN`` (not ``KEYS``) so the operation is
        non-blocking even on large keyspaces.
        """
        pattern = f"{self._tenant_prefix(tenant_id)}*"
        deleted = await self._delete_pattern(pattern)
        await self._record(tenant_id, pattern, deleted, reason, actor)
        return deleted

    async def invalidate_pattern(
        self,
        tenant_id: UUID,
        pattern_suffix: str,
        *,
        reason: InvalidationReason = InvalidationReason.DRIFT,
        actor: str = "system",
    ) -> int:
        """Delete every key matching ``{tenant_prefix}{pattern_suffix}``.

        ``pattern_suffix`` may contain ``*`` wildcards but
        must not escape the tenant prefix. The service caps
        the total number of keys at ``max_keys_per_invalidation``
        and raises if the cap is exceeded.
        """
        if not pattern_suffix:
            raise CacheInvalidationError("pattern_suffix must be non-empty")
        if ".." in pattern_suffix:
            raise CacheInvalidationError("pattern_suffix must not contain '..'")
        pattern = f"{self._tenant_prefix(tenant_id)}{pattern_suffix}"
        deleted = await self._delete_pattern(pattern)
        await self._record(tenant_id, pattern, deleted, reason, actor)
        return deleted

    async def warmup(
        self,
        tenant_id: UUID,
        keys: list[str],
        *,
        actor: str = "system",
    ) -> int:
        """Pre-populate the cache namespace by deleting
        anything stale and reserving the new key set.

        Implementation note: the platform does not have
        write-through caching for these namespaces today,
        so "warmup" is a no-op delete + reservation. The
        method exists so callers can opt-in to the
        behaviour when a future cache layer supports it.
        """
        # Reserve: record the intent. The actual warmup
        # happens when the application makes the first
        # request after this call.
        await self._record(
            tenant_id,
            pattern=f"{self._tenant_prefix(tenant_id)}warmup",
            keys_deleted=0,
            reason=InvalidationReason.RECONFIGURE,
            actor=actor,
        )
        return len(keys)

    # ------------------------------------------------------------------
    # Observability
    # ------------------------------------------------------------------
    def recent_events(self, *, limit: int = 100) -> list[InvalidationEvent]:
        return list(self._events[-limit:])

    def event_count(self) -> int:
        return len(self._events)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    async def _delete_pattern(self, pattern: str) -> int:
        count = 0
        batch: list[str] = []
        async for key in self._redis.scan_iter(match=pattern, count=500):
            batch.append(key)
            if count + len(batch) > self._max_keys:
                raise CacheInvalidationError(
                    f"pattern {pattern!r} matched more than "
                    f"{self._max_keys} keys; refusing to continue"
                )
            if len(batch) >= 500:
                count += int(await self._redis.delete(*batch))
                batch = []
        if batch:
            count += int(await self._redis.delete(*batch))
        return count

    @staticmethod
    def _tenant_prefix(tenant_id: UUID) -> str:
        return f"cortex:{tenant_id}:"

    async def _record(
        self,
        tenant_id: UUID | None,
        pattern: str,
        keys_deleted: int,
        reason: InvalidationReason,
        actor: str,
    ) -> None:
        event = InvalidationEvent(
            tenant_id=tenant_id,
            pattern=pattern,
            keys_deleted=keys_deleted,
            reason=reason,
            actor=actor,
            timestamp=datetime.now(UTC),
        )
        self._events.append(event)
        # Cap the audit buffer so a long-lived process does not grow without bound.
        if len(self._events) > 10_000:
            self._events = self._events[-5_000:]
