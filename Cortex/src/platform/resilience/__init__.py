"""Resilience primitives — retry, circuit breaker, fallback.

V9 Part 2, Task 23.

* :class:`RetryPolicy` — exponential backoff with jitter.
* :class:`CircuitBreaker` — closed / open / half-open state
  machine that protects downstream calls.
* :class:`FallbackHandler` — registers a fallback function
  for a wrapped operation so callers always receive *some*
  response (even if degraded).
"""

from __future__ import annotations

from src.platform.resilience.retry import RetryPolicy, RetryError, RetryStrategy
from src.platform.resilience.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerError,
    CircuitBreakerState,
)
from src.platform.resilience.fallback import FallbackHandler, FallbackStrategy

__all__ = [
    "RetryPolicy",
    "RetryError",
    "RetryStrategy",
    "CircuitBreaker",
    "CircuitBreakerError",
    "CircuitBreakerState",
    "FallbackHandler",
    "FallbackStrategy",
]
