"""
Cortex benchmark suite.

V9 Part 1, Task 11.

Each benchmark runs the same scenario N times and
records the latency distribution, throughput, memory
peak, and CPU peak. Reports are JSON-serialisable so
they can be diffed between releases.

Usage::

    python -m benchmarks --suite knowledge_search --iterations 1000

The ``benchmarks.run()`` helper is the entry point used
by the CI pipeline and the performance regression
suite (V9 Part 4, Task 41).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import platform
import statistics
import time
import tracemalloc
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

try:
    import resource  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - Windows
    resource = None  # type: ignore[assignment]

# Suite name -> async callable taking ``iterations`` and
# returning a list of latencies in seconds.
Suite = Callable[[int], Awaitable[list[float]]]


@dataclass
class BenchmarkResult:
    """Result of one benchmark run."""

    name: str
    iterations: int
    p50_ms: float
    p95_ms: float
    p99_ms: float
    average_ms: float
    min_ms: float
    max_ms: float
    throughput_per_sec: float
    memory_peak_mb: float
    cpu_peak_pct: float
    timestamp: str
    host: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class _Suite:
    name: str
    func: Suite
    description: str = ""


_REGISTRY: dict[str, _Suite] = {}


def register(name: str, *, description: str = "") -> Callable[[Suite], Suite]:
    """Decorator that registers a benchmark suite."""

    def decorator(func: Suite) -> Suite:
        _REGISTRY[name] = _Suite(name=name, func=func, description=description)
        return func

    return decorator


def _percentile(sorted_values: list[float], pct: float) -> float:
    if not sorted_values:
        return 0.0
    k = (len(sorted_values) - 1) * pct
    f = int(k)
    c = min(f + 1, len(sorted_values) - 1)
    if f == c:
        return sorted_values[f] * 1000.0
    return (sorted_values[f] + (sorted_values[c] - sorted_values[f]) * (k - f)) * 1000.0


async def run(name: str, *, iterations: int = 100) -> BenchmarkResult:
    """Run the named suite ``iterations`` times and return the result."""
    suite = _REGISTRY.get(name)
    if suite is None:
        raise KeyError(f"unknown benchmark suite: {name!r}")
    tracemalloc.start()
    started = time.perf_counter()
    latencies = await suite.func(iterations)
    wall = time.perf_counter() - started
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    sorted_lat = sorted(latencies)
    return BenchmarkResult(
        name=name,
        iterations=iterations,
        p50_ms=_percentile(sorted_lat, 0.50),
        p95_ms=_percentile(sorted_lat, 0.95),
        p99_ms=_percentile(sorted_lat, 0.99),
        average_ms=(statistics.mean(sorted_lat) * 1000.0) if sorted_lat else 0.0,
        min_ms=(sorted_lat[0] * 1000.0) if sorted_lat else 0.0,
        max_ms=(sorted_lat[-1] * 1000.0) if sorted_lat else 0.0,
        throughput_per_sec=(iterations / wall) if wall > 0 else 0.0,
        memory_peak_mb=peak / (1024 * 1024),
        cpu_peak_pct=(
            resource.getrusage(resource.RUSAGE_SELF).ru_maxrss if resource else 0
        ),
        timestamp=datetime.now(UTC).isoformat(),
        host=platform.node(),
    )


def available_suites() -> list[str]:
    return list(_REGISTRY)


# Register all suites on import. The suites module is a leaf module that
# only registers via the @register decorator; importing it has no side
# effects beyond populating the registry.
try:
    from benchmarks import suites as _suites  # noqa: F401
except ImportError:  # pragma: no cover - when running as a script
    pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the Cortex benchmark suite.")
    parser.add_argument("--suite", required=True, help="suite name (use --list to see all)")
    parser.add_argument("--iterations", type=int, default=100)
    parser.add_argument("--list", action="store_true", help="list available suites")
    args = parser.parse_args(argv)
    if args.list:
        for name in available_suites():
            print(name)
        return 0
    result = asyncio.run(run(args.suite, iterations=args.iterations))
    print(json.dumps(result.to_dict(), indent=2))
    return 0
