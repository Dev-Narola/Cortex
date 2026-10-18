"""API load testing suite.

V9 Part 2, Task 21.

The suite is split into two parts:

1. **Smoke tests** under ``tests/load/`` — small,
   hermetic scenarios that run in CI.
2. **Full k6 / Locust scenarios** under
   ``benchmarks/load/`` — heavier scenarios for
   staging / pre-release.

The smoke scenarios assert that the API is *able* to
handle the load; the full k6 scenarios are the source
of truth for throughput and latency.
"""

from __future__ import annotations
