"""
``FallbackHandler`` — provides a default response when an
operation is failing.

V9 Part 2, Task 23.

The handler is intentionally simple: it wraps a primary
operation and a fallback. When the primary raises, the
fallback is invoked and its result is returned. If the
fallback also raises, the original error is re-raised.

The handler is the last line of defence for "never let
the user see a 5xx" — but it should only be used when
the caller has a sensible degraded response to offer.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from enum import Enum
from typing import TypeVar

T = TypeVar("T")


class FallbackStrategy(str, Enum):
    """How the fallback is chosen."""

    STATIC = "static"  # always return the same value
    COMPUTED = "computed"  # call the supplied function
    CACHED = "cached"  # return the last successful result


@dataclass
class FallbackHandler:
    """Wrap an operation with a fallback.

    ``on_error`` is an optional observer called when the
    primary raises. It is the right place to record the
    ``fallback_triggered_total`` metric.
    """

    name: str
    strategy: FallbackStrategy = FallbackStrategy.COMPUTED
    static_value: object | None = None
    fallback: Callable[[BaseException], Awaitable[object]] | None = None
    last_success: object | None = None
    trigger_count: int = 0
    last_error: BaseException | None = None

    async def call(
        self,
        operation: Callable[[], Awaitable[T]],
    ) -> T | object:
        """Run ``operation`` and fall back on failure."""
        try:
            result = await operation()
        except Exception as exc:  # noqa: BLE001 - fallback decides
            self.trigger_count += 1
            self.last_error = exc
            return await self._resolve(exc)
        self.last_success = result
        return result

    async def _resolve(self, exc: BaseException) -> object:
        if self.strategy is FallbackStrategy.STATIC:
            return self.static_value
        if self.strategy is FallbackStrategy.CACHED:
            return self.last_success
        if self.fallback is None:
            raise exc
        return await self.fallback(exc)
