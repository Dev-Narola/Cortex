"""
``TenantUsageRollup`` read model.

V9 Part 1 Task 6.

Per-tenant, per-day usage counters used by the billing dashboard
and the per-tenant rate-limit code path. Replaces a real-time
aggregate over the ``usage_events`` table that was the V8
bottleneck for tenants with high event volume.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from src.read_models.base import ReadModelMetadata, ReadModelProtocol, ReadModelStatus


@dataclass(frozen=True, kw_only=True)
class TenantUsageRollup:
    """One day's usage counters for one tenant."""

    tenant_id: UUID
    day: str  # YYYY-MM-DD in UTC
    request_count: int
    document_count: int
    chunk_count: int
    embedding_count: int
    agent_invocation_count: int
    mcp_request_count: int
    graph_extraction_count: int
    storage_bytes: int
    metadata: ReadModelMetadata = field(
        default_factory=lambda: ReadModelMetadata(
            last_refreshed_at=datetime.now(UTC),
            last_refresh_duration_ms=0.0,
        )
    )

    @property
    def name(self) -> str:
        return "tenant_usage_rollup"

    def is_fresh(self, *, now: datetime) -> bool:
        age = (now - self.metadata.last_refreshed_at).total_seconds()
        return age <= self.metadata.stale_after_seconds

    def health(self, *, now: datetime) -> ReadModelStatus:
        if self.metadata.last_error:
            return ReadModelStatus.FAILED
        if self.is_fresh(now=now):
            return ReadModelStatus.READY
        return ReadModelStatus.STALE

    def to_dict(self) -> dict[str, Any]:
        return {
            "tenant_id": str(self.tenant_id),
            "day": self.day,
            "request_count": self.request_count,
            "document_count": self.document_count,
            "chunk_count": self.chunk_count,
            "embedding_count": self.embedding_count,
            "agent_invocation_count": self.agent_invocation_count,
            "mcp_request_count": self.mcp_request_count,
            "graph_extraction_count": self.graph_extraction_count,
            "storage_bytes": self.storage_bytes,
            "last_refreshed_at": self.metadata.last_refreshed_at.isoformat(),
        }
