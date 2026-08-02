"""Tests for HealthService."""

from __future__ import annotations

from uuid import uuid4

import pytest

from src.platform.health import (
    ComponentHealth,
    HealthService,
    HealthStatus,
)


class _StubProbe:
    def __init__(self, name: str, result: ComponentHealth):
        self.name = name
        self._result = result

    async def check(self, *, timeout_seconds: float) -> ComponentHealth:
        return self._result


class TestHealthService:
    async def test_liveness_always_healthy(self) -> None:
        svc = HealthService(probes=[])
        result = await svc.liveness()
        assert result["status"] == "healthy"

    async def test_readiness_aggregates_component_status(self) -> None:
        probes = [
            _StubProbe(
                "db",
                ComponentHealth(
                    name="db",
                    status=HealthStatus.HEALTHY,
                    latency_ms=1.0,
                ),
            ),
            _StubProbe(
                "redis",
                ComponentHealth(
                    name="redis",
                    status=HealthStatus.UNHEALTHY,
                    latency_ms=5.0,
                    detail="timeout",
                ),
            ),
        ]
        svc = HealthService(probes=probes)
        is_ready, payload = await svc.readiness()
        assert is_ready is False
        assert payload["status"] == "unhealthy"
        names = {c["name"] for c in payload["components"]}
        assert names == {"db", "redis"}

    async def test_readiness_handles_probe_exception(self) -> None:
        class _ExplodingProbe:
            name = "x"

            async def check(self, *, timeout_seconds: float) -> ComponentHealth:
                raise RuntimeError("boom")

        svc = HealthService(probes=[_ExplodingProbe()])
        is_ready, payload = await svc.readiness()
        assert is_ready is False
        assert payload["components"][0]["status"] == "unhealthy"
