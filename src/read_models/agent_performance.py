"""
``AgentPerformance`` read model.

V9 Part 1 Task 6.

Per-agent success / latency counters used by the agent
observability dashboard. Replaces a real-time aggregate over
``agent_runs`` that the V6/V7 dashboards ran on every page
load.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from src.read_models.base import ReadModelMetadata, ReadModelProtocol, ReadModelStatus


@dataclass(frozen=True, kw_only=True)
class AgentPerformance:
    """One agent's last-24h performance counters."""

    tenant_id: UUID
    agent_id: UUID
    agent_name: str
    window_start: datetime
    window_end: datetime
    invocations: int
    successes: int
    failures: int
    average_latency_ms: float
    p95_latency_ms: float
    average_cost_usd: float
    metadata: ReadModelMetadata = field(
        default_factory=lambda: ReadModelMetadata(
            last_refreshed_at=datetime.now(UTC),
            last_refresh_duration_ms=0.0,
        )
    )

    @property
    def name(self) -> str:
        return "agent_performance"

    def is_fresh(self, *, now: datetime) -> bool:
        age = (now - self.metadata.last_refreshed_at).total_seconds()
        return age <= self.metadata.stale_after_seconds

    def health(self, *, now: datetime) -> ReadModelStatus:
        if self.metadata.last_error:
            return ReadModelStatus.FAILED
        if self.is_fresh(now=now):
            return ReadModelStatus.READY
        return ReadModelStatus.STALE

    @property
    def success_rate(self) -> float:
        if self.invocations == 0:
            return 0.0
        return self.successes / self.invocations

    def to_dict(self) -> dict[str, Any]:
        return {
            "tenant_id": str(self.tenant_id),
            "agent_id": str(self.agent_id),
            "agent_name": self.agent_name,
            "window_start": self.window_start.isoformat(),
            "window_end": self.window_end.isoformat(),
            "invocations": self.invocations,
            "successes": self.successes,
            "failures": self.failures,
            "success_rate": self.success_rate,
            "average_latency_ms": self.average_latency_ms,
            "p95_latency_ms": self.p95_latency_ms,
            "average_cost_usd": self.average_cost_usd,
            "last_refreshed_at": self.metadata.last_refreshed_at.isoformat(),
        }
