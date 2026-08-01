"""
``RetryPolicy`` — exponential backoff with jitter.

V9 Part 2, Task 23.

The policy is intentionally simple: configurable
``max_attempts``, base delay, max delay, and a multiplier.
Jitter is ±20% of the computed delay so synchronised
clients do not all retry at the same instant.

The policy is framework-agnostic — it does not know about
Redis or any other dependency. The application supplies
the *predicate* (``should_retry``) that decides whether
an exception is transient.
"""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from enum import Enum
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")


class RetryStrategy(str, Enum):
    """Backoff strategy."""

    EXPONENTIAL = "exponential"
    LINEAR = "linear"
    CONSTANT = "constant"


class RetryError(RuntimeError):
    """Raised when the policy exhausts its attempts."""


@dataclass(frozen=True)
class RetryPolicy:
    """Reusable retry policy.

    ``max_attempts`` is the *total* number of attempts
    (including the first). ``base_delay`` is the delay
    before the second attempt.
    """

    max_attempts: int = 3
    base_delay: float = 0.5
    max_delay: float = 30.0
    multiplier: float = 2.0
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL
    jitter: float = 0.2  # ±20%

    def delay_for(self, attempt: int) -> float:
        """Return the delay (in seconds) before ``attempt`` (1-indexed)."""
        if attempt <= 0:
            return 0.0
        if self.strategy is RetryStrategy.CONSTANT:
            raw = self.base_delay
        elif self.strategy is RetryStrategy.LINEAR:
            raw = self.base_delay * attempt
        else:
            raw = self.base_delay * (self.multiplier ** (attempt - 1))
        capped = min(raw, self.max_delay)
        if self.jitter > 0:
            delta = capped * self.jitter
            capped = max(0.0, capped + random.uniform(-delta, delta))
        return capped

    async def execute(
        self,
        operation: Callable[[], Awaitable[T]],
        *,
        should_retry: Callable[[BaseException], bool] | None = None,
        on_retry: Callable[[int, BaseException, float], None] | None = None,
    ) -> T:
        """Run ``operation`` under the retry policy.

        ``should_retry`` decides whether an exception is
        transient; if it returns False, the policy raises
        immediately. ``on_retry`` is the optional observer
        invoked before each sleep (useful for metrics).
        """
        attempt = 0
        while True:
            attempt += 1
            try:
                return await operation()
            except Exception as exc:  # noqa: BLE001 - policy decides
                if attempt >= self.max_attempts:
                    raise RetryError(f"exhausted {attempt} attempts") from exc
                if should_retry is not None and not should_retry(exc):
                    raise
                delay = self.delay_for(attempt)
                if on_retry is not None:
                    try:
                        on_retry(attempt, exc, delay)
                    except Exception:  # noqa: BLE001 - observer must not break retry
                        pass
                await asyncio.sleep(delay)
