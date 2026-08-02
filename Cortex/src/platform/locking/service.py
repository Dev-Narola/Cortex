"""
``DistributedLockService`` — Redis-backed cooperative locks.

V9 Part 2, Task 15.

API:

* :meth:`acquire` returns a :class:`DistributedLock` (or raises
  :class:`DistributedLockNotAcquiredError`).
* :meth:`renew` extends the lock TTL (used by long-running
  jobs to avoid premature expiry).
* :meth:`release` is a compare-and-delete: it only releases
  the lock if the caller still owns the token.
* :meth:`exists` returns True if *any* holder owns the
  lock; useful for "is the job already running?" checks.

The service is intentionally minimal: the canonical Redis
"Redlock" pattern is overkill for the Cortex fleet because we
operate a single Redis primary. If we move to a multi-master
Redis cluster, the lock implementation should be re-evaluated
(ADR-0010 will record the decision).
"""

from __future__ import annotations

import asyncio
import secrets
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Protocol


class DistributedLockError(RuntimeError):
    """Base class for all distributed-lock errors."""


class DistributedLockNotAcquiredError(DistributedLockError):
    """Raised when ``acquire`` cannot obtain the lock within the timeout."""


class DistributedLockLostError(DistributedLockError):
    """Raised when an operation is using a lock that has expired."""


@dataclass(frozen=True)
class DistributedLock:
    """Handle returned by :meth:`DistributedLockService.acquire`.

    The token is a random 128-bit string stored in Redis and
    echoed back on release. The lock is ``release``-d by the
    context manager; ``renew`` is exposed for long-running
    jobs that need to extend the lease.
    """

    name: str
    token: str
    ttl_seconds: float
    acquired_at: float

    @property
    def age_seconds(self) -> float:
        return max(0.0, time.monotonic() - self.acquired_at)


class _RedisLike(Protocol):
    """Subset of the async redis client we depend on.

    Defining the protocol locally keeps the service unit-testable
    without pulling in a real Redis connection.
    """

    async def set(
        self,
        name: str,
        value: str,
        *,
        nx: bool = False,
        px: int | None = None,
    ) -> Any: ...

    async def eval(self, script: str, numkeys: int, *args: Any) -> Any: ...

    async def exists(self, name: str) -> int: ...

    async def delete(self, name: str) -> int: ...


# Lua: release the lock only if the caller still owns it.
_RELEASE_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
else
    return 0
end
"""

# Lua: extend the lock only if the caller still owns it.
_RENEW_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('pexpire', KEYS[1], ARGV[2])
else
    return 0
end
"""


class DistributedLockService:
    """Redis-backed cooperative lock service.

    The service is created once per process; it is safe to
    share across coroutines because every call goes through
    Redis (the source of truth).
    """

    KEY_PREFIX = "cortex:lock:"

    def __init__(
        self,
        redis: _RedisLike,
        *,
        default_ttl_seconds: float = 30.0,
        default_acquire_timeout_seconds: float = 5.0,
    ) -> None:
        self._redis = redis
        self._default_ttl = default_ttl_seconds
        self._default_timeout = default_acquire_timeout_seconds

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def acquire(
        self,
        name: str,
        *,
        ttl_seconds: float | None = None,
        acquire_timeout_seconds: float | None = None,
    ) -> DistributedLock:
        """Acquire a lock by ``name``.

        The implementation polls ``SET NX PX`` until either
        the lock is obtained or the timeout elapses. Polling
        is preferred over a long blocking ``BLPOP`` because
        the acquire path is hot (workers entering a job).
        """
        ttl_ms = int((ttl_seconds or self._default_ttl) * 1000)
        deadline = time.monotonic() + (acquire_timeout_seconds or self._default_timeout)
        key = self._key(name)
        token = self._new_token()
        backoff = 0.05
        while True:
            ok = await self._redis.set(key, token, nx=True, px=ttl_ms)
            if ok:
                return DistributedLock(
                    name=name,
                    token=token,
                    ttl_seconds=ttl_ms / 1000.0,
                    acquired_at=time.monotonic(),
                )
            if time.monotonic() >= deadline:
                raise DistributedLockNotAcquiredError(name)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 1.5, 0.5)

    async def release(self, lock: DistributedLock) -> bool:
        """Release ``lock`` if the caller still owns it.

        Returns True if the lock was released, False if it
        had already expired or had been stolen.
        """
        result = await self._redis.eval(
            _RELEASE_SCRIPT, 1, self._key(lock.name), lock.token
        )
        return bool(result)

    async def renew(self, lock: DistributedLock, *, ttl_seconds: float) -> bool:
        """Extend the lock TTL if the caller still owns it.

        Returns False if the lock was lost — callers should
        treat that as a fatal error and abort the protected
        section.
        """
        ttl_ms = int(ttl_seconds * 1000)
        result = await self._redis.eval(
            _RENEW_SCRIPT, 1, self._key(lock.name), lock.token, str(ttl_ms)
        )
        if not result:
            raise DistributedLockLostError(lock.name)
        return True

    async def exists(self, name: str) -> bool:
        """Return True if any holder owns the lock."""
        return bool(await self._redis.exists(self._key(name)))

    @asynccontextmanager
    async def guard(
        self,
        name: str,
        *,
        ttl_seconds: float | None = None,
        acquire_timeout_seconds: float | None = None,
    ):
        """Context manager that acquires a lock for the duration of the block.

        Usage::

            async with lock_service.guard("graph_extract:{tenant_id}"):
                await do_extraction()
        """
        lock = await self.acquire(
            name,
            ttl_seconds=ttl_seconds,
            acquire_timeout_seconds=acquire_timeout_seconds,
        )
        try:
            yield lock
        finally:
            try:
                await self.release(lock)
            except Exception:  # noqa: BLE001 - release must not raise
                pass

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _key(name: str) -> str:
        if not name:
            raise ValueError("lock name must be non-empty")
        return f"{DistributedLockService.KEY_PREFIX}{name}"

    @staticmethod
    def _new_token() -> str:
        return secrets.token_hex(16)
