"""
Fault injection primitives used by the chaos tests.

V9 Part 3, Task 31-33.

The fault injector wraps an async callable and applies a
configurable *scenario*:

* ``unavailable`` — every call raises a transient error.
* ``slow`` — every call sleeps for ``delay_seconds``
  before returning.
* ``flaky`` — calls fail with ``failure_rate`` probability.
* ``read_only`` — write operations raise.
* ``connection_exhaustion`` — the first N calls succeed;
  the rest raise.

The injector is the *only* place the chaos tests touch
the dependency; the tests themselves assert the
*resilience* behaviour, not the dependency's correctness.
"""

from __future__ import annotations

import asyncio
import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, TypeVar

T = TypeVar("T")


class FaultError(RuntimeError):
    """Raised by a fault-injected call."""


@dataclass
class FaultInjector:
    """Wrap an async operation with a configurable fault."""

    name: str
    target: Callable[..., Awaitable[T]]
    failure_rate: float = 0.0
    delay_seconds: float = 0.0
    read_only: bool = False
    connection_limit: int | None = None
    _call_count: int = 0
    _failure_count: int = 0
    _delay_total: float = 0.0
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def __call__(self, *args: Any, **kwargs: Any) -> T:
        async with self._lock:
            self._call_count += 1
            call_index = self._call_count
        if self.connection_limit is not None and call_index > self.connection_limit:
            self._failure_count += 1
            raise FaultError(f"{self.name}: connection pool exhausted")
        if self.failure_rate > 0 and random.random() < self.failure_rate:
            self._failure_count += 1
            raise FaultError(f"{self.name}: injected failure")
        if self.delay_seconds > 0:
            await asyncio.sleep(self.delay_seconds)
            self._delay_total += self.delay_seconds
        if self.read_only and kwargs.get("write"):
            self._failure_count += 1
            raise FaultError(f"{self.name}: read-only backend")
        return await self.target(*args, **kwargs)

    @property
    def stats(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "call_count": self._call_count,
            "failure_count": self._failure_count,
            "delay_total_seconds": self._delay_total,
        }

    def reset(self) -> None:
        self._call_count = 0
        self._failure_count = 0
        self._delay_total = 0.0


def unavailable(name: str, target: Callable[..., Awaitable[T]]) -> FaultInjector:
    """Wrap ``target`` so every call raises."""
    return FaultInjector(name=name, target=target, failure_rate=1.0)


def slow(
    name: str,
    target: Callable[..., Awaitable[T]],
    *,
    delay_seconds: float,
) -> FaultInjector:
    """Wrap ``target`` so every call sleeps before returning."""
    return FaultInjector(name=name, target=target, delay_seconds=delay_seconds)


def flaky(
    name: str,
    target: Callable[..., Awaitable[T]],
    *,
    failure_rate: float,
) -> FaultInjector:
    """Wrap ``target`` so calls fail with ``failure_rate`` probability."""
    return FaultInjector(name=name, target=target, failure_rate=failure_rate)


def read_only(
    name: str,
    target: Callable[..., Awaitable[T]],
) -> FaultInjector:
    """Wrap ``target`` so write operations raise."""
    return FaultInjector(name=name, target=target, read_only=True)


def connection_exhausted(
    name: str,
    target: Callable[..., Awaitable[T]],
    *,
    limit: int,
) -> FaultInjector:
    """Wrap ``target`` so the first ``limit`` calls succeed; the rest fail."""
    return FaultInjector(name=name, target=target, connection_limit=limit)
