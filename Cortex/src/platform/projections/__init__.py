"""Projection service — keeps read models in sync with the source of truth.

V9 Part 1 Task 7.

The :class:`ProjectionService` is the only place that knows how to
*rebuild*, *refresh*, *invalidate*, and *sync* a read model. The
rest of the platform either:

* asks the projection service for the current snapshot
  (``get_or_build``); or
* emits a domain event that the projection service subscribes to
  (the V9 plan is for V9.1 to wire event-driven refresh).

Synchronisation strategies:

* ``rebuild`` — drop the projection and recompute it from
  scratch. Used after schema migrations, batch imports, or
  detected drift.
* ``refresh`` — incrementally update the projection by applying
  one or more *deltas*. Cheaper than rebuild.
* ``invalidate`` — drop the projection and force the next reader
  to rebuild. Used on transient errors or as a safety net.
* ``sync`` — fan-out: refresh every registered projection in
  parallel with a per-projection timeout.

The service is intentionally framework-agnostic — the application
layer is responsible for wiring it to the actual session / Redis
backing store. See ``src/platform/dependencies.py``.
"""

from __future__ import annotations

from src.platform.projections.service import (
    ProjectionBuildError,
    ProjectionKey,
    ProjectionLockError,
    ProjectionNotFoundError,
    ProjectionService,
    ProjectionStrategy,
    ProjectionTimeoutError,
)

__all__ = [
    "ProjectionService",
    "ProjectionStrategy",
    "ProjectionKey",
    "ProjectionBuildError",
    "ProjectionLockError",
    "ProjectionNotFoundError",
    "ProjectionTimeoutError",
]
