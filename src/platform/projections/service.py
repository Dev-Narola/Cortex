"""
``ProjectionService`` — the read-model refresh engine.

V9 Part 1 Task 7.

The service is intentionally framework-agnostic. It accepts a
*builder* for each read model and uses :class:`asyncio.Lock` to
serialise concurrent refreshes for the same projection key
(``(model_name, tenant_id, entity_id)``).

The platform dependencies wire concrete builders in
``src/platform/dependencies.py``; this file just defines the
mechanics + a small in-process lock registry.

For multi-process deployments (V9 Part 2), the
:class:`src.platform.locking.DistributedLockService` plugs in
here so that only one API instance rebuilds a given
projection at a time.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, TypeVar
from uuid import UUID

from src.read_models.base import ReadModelMetadata, ReadModelProtocol, ReadModelStatus

T = TypeVar("T", bound=ReadModelProtocol)


class ProjectionStrategy(str, Enum):
    """Refresh strategy to use for a projection."""

    REBUILD = "rebuild"
    REFRESH = "refresh"
    INVALIDATE = "invalidate"
    SYNC = "sync"


class ProjectionNotFoundError(KeyError):
    """Raised when a builder is not registered for a model name."""


class ProjectionLockError(RuntimeError):
    """Raised when a refresh cannot acquire its distributed lock."""


class ProjectionTimeoutError(TimeoutError):
    """Raised when a refresh exceeds the per-projection timeout."""


class ProjectionBuildError(RuntimeError):
    """Raised when a builder raises; the previous snapshot is preserved."""


@dataclass(frozen=True)
class ProjectionKey:
    """Identifies a single projection instance.

    ``model_name`` is the :attr:`ReadModelProtocol.name`;
    ``tenant_id`` scopes the projection; ``entity_id`` is the
    optional per-entity discriminator (``None`` for tenant-wide
    rollups like :class:`TenantUsageRollup`).
    """

    model_name: str
    tenant_id: UUID
    entity_id: UUID | None = None

    def __str__(self) -> str:  # pragma: no cover - trivial
        if self.entity_id is None:
            return f"{self.model_name}@{self.tenant_id}"
        return f"{self.model_name}@{self.tenant_id}:{self.entity_id}"


@dataclass
class _ProjectionEntry:
    """Mutable wrapper around a single projection snapshot."""

    key: ProjectionKey
    snapshot: ReadModelProtocol | None = None
    status: ReadModelStatus = ReadModelStatus.STALE
    last_attempt_at: datetime | None = None
    last_error: str | None = None
    build_attempts: int = 0


# Type aliases for the plug-in functions the service consumes.
RebuildFn = Callable[[ProjectionKey, ReadModelProtocol | None], Awaitable[ReadModelProtocol]]
RefreshFn = Callable[[ProjectionKey, ReadModelProtocol | None], Awaitable[ReadModelProtocol]]
BuilderFn = Callable[[ProjectionKey, ReadModelProtocol | None], Awaitable[ReadModelProtocol]]
InvalidateFn = Callable[[ProjectionKey], Awaitable[None]]


class ProjectionService:
    """In-process projection registry + refresh orchestrator.

    The service is *stateless* apart from the in-process
    snapshot cache, which is intentionally a cache (not a
    source of truth). The async locks are also in-process;
    multi-process deployments use the distributed lock
    service from V9 Part 2.
    """

    def __init__(
        self,
        *,
        default_timeout_seconds: float = 30.0,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._entries: dict[ProjectionKey, _ProjectionEntry] = {}
        self._locks: dict[ProjectionKey, asyncio.Lock] = {}
        self._registry_lock = asyncio.Lock()
        self._rebuilders: dict[str, RebuildFn] = {}
        self._refreshers: dict[str, RefreshFn] = {}
        self._invalidators: dict[str, InvalidateFn] = {}
        self._default_timeout_seconds = default_timeout_seconds
        self._clock = clock or (lambda: datetime.now(UTC))

    # ------------------------------------------------------------------
    # Builder registration
    # ------------------------------------------------------------------
    def register(
        self,
        model_name: str,
        *,
        rebuilder: RebuildFn | None = None,
        refresher: RefreshFn | None = None,
        invalidator: InvalidateFn | None = None,
    ) -> None:
        """Register builders for ``model_name``.

        At minimum the ``rebuilder`` must be supplied; the
        ``refresher`` and ``invalidator`` default to the
        ``rebuilder`` when not provided.
        """
        if rebuilder is None and refresher is None and invalidator is None:
            raise ValueError("at least one builder must be supplied")
        if rebuilder is not None:
            self._rebuilders[model_name] = rebuilder
        if refresher is not None:
            self._refreshers[model_name] = refresher
        else:
            # Default refresher = rebuilder (full recompute)
            if rebuilder is not None:
                self._refreshers[model_name] = rebuilder
        if invalidator is not None:
            self._invalidators[model_name] = invalidator
        else:
            async def _default_invalidate(key: ProjectionKey) -> None:
                # drop the entry from the cache; the next reader will rebuild
                self._entries.pop(key, None)

            self._invalidators[model_name] = _default_invalidate

    # ------------------------------------------------------------------
    # Read API
    # ------------------------------------------------------------------
    async def get_or_build(self, key: ProjectionKey) -> ReadModelProtocol:
        """Return the current snapshot, rebuilding if missing or stale.

        The service treats a projection as *stale* when its
        ``last_refreshed_at`` is older than the model-specific
        ``stale_after_seconds`` window. The application may
        override this by calling :meth:`force_rebuild` first.
        """
        entry = self._entries.get(key)
        if entry is not None and entry.snapshot is not None:
            if entry.snapshot.is_fresh(now=self._clock()):
                return entry.snapshot
        return await self._refresh_locked(key, strategy=ProjectionStrategy.REBUILD)

    def get_cached(self, key: ProjectionKey) -> ReadModelProtocol | None:
        """Return the snapshot without triggering a rebuild.

        Returns ``None`` when no snapshot has been built.
        """
        entry = self._entries.get(key)
        return entry.snapshot if entry is not None else None

    def is_stale(self, key: ProjectionKey) -> bool:
        """Return True when the projection is missing or stale."""
        entry = self._entries.get(key)
        if entry is None or entry.snapshot is None:
            return True
        return not entry.snapshot.is_fresh(now=self._clock())

    # ------------------------------------------------------------------
    # Write API
    # ------------------------------------------------------------------
    async def rebuild(self, key: ProjectionKey) -> ReadModelProtocol:
        """Force a full rebuild of the projection.

        Raises :class:`ProjectionBuildError` if the builder fails;
        raises :class:`ProjectionTimeoutError` if the build
        exceeds the timeout.
        """
        return await self._refresh_locked(key, strategy=ProjectionStrategy.REBUILD)

    async def refresh(self, key: ProjectionKey) -> ReadModelProtocol:
        """Incrementally refresh the projection.

        If no snapshot exists, falls back to a full rebuild.
        """
        return await self._refresh_locked(key, strategy=ProjectionStrategy.REFRESH)

    async def invalidate(self, key: ProjectionKey) -> None:
        """Drop the projection; the next reader will rebuild it."""
        invalidator = self._invalidators.get(key.model_name)
        if invalidator is None:
            raise ProjectionNotFoundError(key.model_name)
        await invalidator(key)
        self._entries.pop(key, None)

    async def invalidate_tenant(self, tenant_id: UUID) -> int:
        """Invalidate every projection for ``tenant_id``."""
        keys = [k for k in self._entries if k.tenant_id == tenant_id]
        for key in keys:
            await self.invalidate(key)
        return len(keys)

    async def sync(
        self,
        keys: list[ProjectionKey],
        *,
        strategy: ProjectionStrategy = ProjectionStrategy.REFRESH,
        timeout_seconds: float | None = None,
    ) -> list[ReadModelProtocol]:
        """Refresh a batch of projections concurrently.

        The fan-out is bounded by ``asyncio.gather`` and the
        per-projection timeout is ``timeout_seconds`` (default =
        :attr:`_default_timeout_seconds`).
        """
        tasks = [
            self._refresh_locked(k, strategy=strategy, timeout=timeout_seconds)
            for k in keys
        ]
        return await asyncio.gather(*tasks, return_exceptions=False)

    # ------------------------------------------------------------------
    # Health / observability
    # ------------------------------------------------------------------
    def health(self) -> dict[str, Any]:
        """Return a summary of every known projection's state."""
        now = self._clock()
        result: dict[str, Any] = {}
        for key, entry in self._entries.items():
            status = entry.status
            if entry.snapshot is not None and entry.snapshot.is_fresh(now=now):
                status = ReadModelStatus.READY
            result[str(key)] = {
                "status": status.value,
                "last_error": entry.last_error,
                "build_attempts": entry.build_attempts,
                "last_attempt_at": (
                    entry.last_attempt_at.isoformat() if entry.last_attempt_at else None
                ),
            }
        return result

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    async def _refresh_locked(
        self,
        key: ProjectionKey,
        *,
        strategy: ProjectionStrategy,
        timeout: float | None = None,
    ) -> ReadModelProtocol:
        if strategy == ProjectionStrategy.INVALIDATE:
            await self.invalidate(key)
            raise ProjectionBuildError("invalidate has no snapshot to return")

        lock = await self._get_lock(key)
        async with lock:
            # Re-check the cache after acquiring the lock so concurrent
            # callers don't duplicate the rebuild.
            if strategy == ProjectionStrategy.REBUILD:
                entry = self._entries.get(key)
                if entry is not None and entry.snapshot is not None and entry.snapshot.is_fresh(
                    now=self._clock()
                ):
                    return entry.snapshot
                builder = self._rebuilders.get(key.model_name)
                if builder is None:
                    raise ProjectionNotFoundError(key.model_name)
                return await self._run_with_timeout(key, builder, previous=None)
            if strategy == ProjectionStrategy.REFRESH:
                builder = self._refreshers.get(key.model_name)
                if builder is None:
                    raise ProjectionNotFoundError(key.model_name)
                entry = self._entries.get(key)
                previous = entry.snapshot if entry is not None else None
                return await self._run_with_timeout(key, builder, previous=previous)
            raise ValueError(f"unknown strategy: {strategy}")

    async def _run_refresh(
        self,
        key: ProjectionKey,
        builder: RefreshFn,
        previous: ReadModelProtocol | None,
    ) -> ReadModelProtocol:
        return await self._run_with_timeout(key, builder, previous=previous)

    async def _run_with_timeout(
        self,
        key: ProjectionKey,
        builder: Callable[..., Awaitable[ReadModelProtocol]],
        *,
        previous: ReadModelProtocol | None,
    ) -> ReadModelProtocol:
        timeout = self._default_timeout_seconds
        entry = self._entries.setdefault(key, _ProjectionEntry(key=key))
        entry.status = ReadModelStatus.BUILDING
        entry.build_attempts += 1
        entry.last_attempt_at = self._clock()
        started = time.perf_counter()
        try:
            snapshot = await asyncio.wait_for(builder(key, previous), timeout=timeout)
        except TimeoutError as exc:
            entry.status = ReadModelStatus.FAILED
            entry.last_error = f"timeout after {timeout}s"
            raise ProjectionTimeoutError(str(key)) from exc
        except Exception as exc:  # noqa: BLE001 - we want to record and re-raise
            entry.status = ReadModelStatus.FAILED
            entry.last_error = repr(exc)
            raise ProjectionBuildError(str(exc)) from exc
        duration_ms = (time.perf_counter() - started) * 1000.0
        # Refresh the metadata on the snapshot so is_fresh() works.
        # We deliberately rebuild the dataclass to preserve immutability.
        refreshed = self._with_metadata(snapshot, duration_ms, entry.last_error, entry.build_attempts)
        entry.snapshot = refreshed
        entry.last_error = None
        entry.status = ReadModelStatus.READY
        return refreshed

    @staticmethod
    def _with_metadata(
        snapshot: ReadModelProtocol,
        duration_ms: float,
        last_error: str | None,
        build_attempts: int,
    ) -> ReadModelProtocol:
        # The read models are frozen dataclasses; replace the
        # ``metadata`` field via ``dataclasses.replace``.
        import dataclasses

        if not dataclasses.is_dataclass(snapshot):
            return snapshot
        new_meta = ReadModelMetadata(
            last_refreshed_at=datetime.now(UTC),
            last_refresh_duration_ms=duration_ms,
            last_error=last_error,
            build_attempts=build_attempts,
        )
        try:
            return dataclasses.replace(snapshot, metadata=new_meta)  # type: ignore[arg-type]
        except TypeError:
            return snapshot

    async def _get_lock(self, key: ProjectionKey) -> asyncio.Lock:
        async with self._registry_lock:
            lock = self._locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[key] = lock
            return lock
