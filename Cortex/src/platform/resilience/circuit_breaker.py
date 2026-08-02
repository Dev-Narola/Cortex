"""
``CircuitBreaker`` — closed / open / half-open state machine.

V9 Part 2, Task 23.

The breaker is intentionally minimal:

* ``closed`` — calls flow through; failures are counted.
* ``open`` — calls fail fast for ``reset_timeout`` seconds.
* ``half_open`` — a single trial call is allowed; success
  closes the breaker, failure re-opens it.

The breaker is safe to share between coroutines. It does
**not** own its own clock — pass ``now`` if you need a
deterministic clock for tests.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from enum import Enum
from typing import TypeVar

T = TypeVar("T")


class CircuitBreakerState(str, Enum):
    """Possible breaker states."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerError(RuntimeError):
    """Raised when a call is rejected because the breaker is open."""


@dataclass
class CircuitBreaker:
    """Async circuit breaker.

    ``failure_threshold`` is the number of consecutive
    failures that open the breaker. ``reset_timeout`` is the
    time the breaker stays open before transitioning to
    half-open.
    """

    name: str
    failure_threshold: int = 5
    reset_timeout: float = 30.0
    state: CircuitBreakerState = CircuitBreakerState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    opened_at: float | None = None
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _half_open_in_flight: bool = False

    async def call(
        self,
        operation: Callable[[], Awaitable[T]],
        *,
        now: Callable[[], float] | None = None,
    ) -> T:
        """Run ``operation`` under the breaker.

        Raises :class:`CircuitBreakerError` when the breaker
        is open and the reset timeout has not elapsed.
        """
        now = now or time.monotonic
        async with self._lock:
            self._maybe_recover(now=now)
            if self.state is CircuitBreakerState.OPEN:
                raise CircuitBreakerError(
                    f"breaker {self.name!r} is open"
                )
            if self.state is CircuitBreakerState.HALF_OPEN:
                if self._half_open_in_flight:
                    raise CircuitBreakerError(
                        f"breaker {self.name!r} is half-open with a trial in flight"
                    )
                self._half_open_in_flight = True
        try:
            result = await operation()
        except Exception as exc:  # noqa: BLE001
            await self._record_failure(now=now)
            raise
        else:
            await self._record_success(now=now)
            return result

    # ------------------------------------------------------------------
    # Observability
    # ------------------------------------------------------------------
    def snapshot(self) -> dict[str, object]:
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "opened_at": self.opened_at,
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _maybe_recover(self, *, now: Callable[[], float]) -> None:
        if (
            self.state is CircuitBreakerState.OPEN
            and self.opened_at is not None
            and (now() - self.opened_at) >= self.reset_timeout
        ):
            self.state = CircuitBreakerState.HALF_OPEN
            self.failure_count = 0

    async def _record_failure(self, *, now: Callable[[], float]) -> None:
        async with self._lock:
            self.failure_count += 1
            if self.state is CircuitBreakerState.HALF_OPEN:
                self.state = CircuitBreakerState.OPEN
                self.opened_at = now()
                self._half_open_in_flight = False
            elif (
                self.state is CircuitBreakerState.CLOSED
                and self.failure_count >= self.failure_threshold
            ):
                self.state = CircuitBreakerState.OPEN
                self.opened_at = now()

    async def _record_success(self, *, now: Callable[[], float]) -> None:
        async with self._lock:
            self.success_count += 1
            if self.state is CircuitBreakerState.HALF_OPEN:
                self.state = CircuitBreakerState.CLOSED
                self.failure_count = 0
                self.opened_at = None
                self._half_open_in_flight = False
