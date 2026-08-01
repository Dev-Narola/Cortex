"""
Base classes and shared types for the read-model layer.

V9 Part 1 Task 6.

The read models are deliberately small frozen dataclasses so they
can be safely shared between threads (the application services are
async, but the read models themselves are sync). The :class:`ReadModelProtocol`
captures the contract every read model exposes so the
:class:`src.platform.projections.ProjectionService` can treat them
uniformly.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Protocol, runtime_checkable


class ReadModelStatus(str, Enum):
    """Lifecycle state of a read-model projection.

    The platform tracks the *staleness* of each projection so the
    application can decide whether to serve a slightly-stale
    snapshot or fail loud. ``READY`` means the projection was
    refreshed within ``stale_after_seconds``; ``STALE`` means it
    is past that window; ``BUILDING`` means a refresh is in
    flight (so readers should wait rather than start a second
    one); ``FAILED`` means the last refresh raised and the
    error has been recorded.
    """

    READY = "ready"
    STALE = "stale"
    BUILDING = "building"
    FAILED = "failed"


class StaleReadModelError(RuntimeError):
    """Raised when a caller refuses to accept a stale read model."""


@dataclass(frozen=True, kw_only=True)
class ReadModelMetadata:
    """Refresh metadata shared by every read model.

    Stored alongside the projection so the application can decide
    whether to serve it, refresh it, or fail loud. ``last_refreshed_at``
    is set by :class:`src.platform.projections.ProjectionService`
    on a successful refresh; ``stale_after_seconds`` is the
    caller's tolerance (defaults to 5 minutes).
    """

    last_refreshed_at: datetime
    last_refresh_duration_ms: float
    last_error: str | None = None
    build_attempts: int = 0
    stale_after_seconds: int = 300  # 5 minutes


@runtime_checkable
class ReadModelProtocol(Protocol):
    """Contract every read model must satisfy.

    The projection service relies on duck-typing; this Protocol
    exists for documentation, IDE assistance, and the architecture
    validator (``tests/architecture/``).
    """

    @property
    def name(self) -> str:
        """Stable identifier — used as the cache key + Prometheus label."""

    def is_fresh(self, *, now: datetime) -> bool:
        """Return True if the projection is within the staleness window."""
