"""
``HealthService`` — liveness + readiness checks.

V9 Part 2, Task 24.

Liveness: lightweight; the process is alive and serving
HTTP. Returns 200 as long as the loop is responsive.

Readiness: heavier; every downstream dependency is probed
(Postgres, Redis, Neo4j, object storage, queue, worker
heartbeat). Returns 200 only when the process can serve
real traffic.

The framework records per-component status with a
configurable timeout (``HEALTH_CHECK_TIMEOUT``) so a single
slow dependency does not block the entire readiness
response.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from enum import Enum
from typing import Awaitable, Callable, Protocol
from uuid import UUID


class HealthStatus(str, Enum):
    """Per-component health verdict."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass(frozen=True)
class ComponentHealth:
    """One component's health snapshot."""

    name: str
    status: HealthStatus
    latency_ms: float
    detail: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "status": self.status.value,
            "latency_ms": round(self.latency_ms, 2),
            "detail": self.detail,
        }


class HealthProbe(Protocol):
    """Interface every probe must implement."""

    name: str

    async def check(self, *, timeout_seconds: float) -> ComponentHealth: ...


@dataclass
class HealthService:
    """Liveness + readiness orchestrator."""

    probes: list[HealthProbe]
    default_timeout_seconds: float = 5.0

    async def liveness(self) -> dict[str, object]:
        """Always-200 response if the loop is responsive."""
        return {
            "status": HealthStatus.HEALTHY.value,
            "timestamp": time.time(),
        }

    async def readiness(
        self,
        *,
        tenant_id: UUID | None = None,
    ) -> tuple[bool, dict[str, object]]:
        """Run every probe concurrently and aggregate the result.

        Returns ``(is_ready, payload)``. The payload lists
        every component's status so operators can see at a
        glance which dependency is failing.
        """
        if not self.probes:
            return True, {"status": HealthStatus.HEALTHY.value, "components": []}
        results = await asyncio.gather(
            *(probe.check(timeout_seconds=self.default_timeout_seconds) for probe in self.probes),
            return_exceptions=True,
        )
        components: list[ComponentHealth] = []
        is_ready = True
        for probe, result in zip(self.probes, results, strict=False):
            if isinstance(result, BaseException):
                components.append(
                    ComponentHealth(
                        name=probe.name,
                        status=HealthStatus.UNHEALTHY,
                        latency_ms=self.default_timeout_seconds * 1000.0,
                        detail=repr(result),
                    )
                )
                is_ready = False
            else:
                components.append(result)
                if result.status is HealthStatus.UNHEALTHY:
                    is_ready = False
        return is_ready, {
            "status": HealthStatus.HEALTHY.value if is_ready else HealthStatus.UNHEALTHY.value,
            "components": [c.to_dict() for c in components],
        }
