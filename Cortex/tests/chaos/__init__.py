"""Chaos engineering test suite.

V9 Part 3, Task 31-33.

These tests intentionally exercise the resilience layer
under simulated failure conditions:

* Database unavailable / slow
* Redis unavailable
* LLM provider outage
* Object storage outage
* Network latency / packet loss

The tests use a *fault injection* abstraction rather than
real network chaos (toxiproxy / chaos-mesh) so they can
run in CI without privileged access. Production chaos
suites use the real infrastructure (see
`tests/chaos/integration/`).
"""

from __future__ import annotations

__all__: list[str] = []
