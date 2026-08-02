"""
``DocumentHealth`` read model.

V9 Part 1 Task 6.

Per-document ingestion / embedding / graph-extraction health
indicator. Drives the operator dashboard and the "stuck
ingestion" alerting. Computed from the latest job + chunk
state; the projection service refreshes it after every job
lifecycle event.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from src.read_models.base import ReadModelMetadata, ReadModelProtocol, ReadModelStatus


@dataclass(frozen=True, kw_only=True)
class DocumentHealth:
    """Health indicator for one document's pipeline state."""

    tenant_id: UUID
    document_id: UUID
    ingestion_state: str  # pending | processing | completed | failed
    embedding_state: str
    graph_state: str  # not_started | extracting | completed | failed | disabled
    failed_chunk_count: int
    pending_chunk_count: int
    last_job_status: str
    last_job_error: str | None
    last_updated_at: datetime
    metadata: ReadModelMetadata = field(
        default_factory=lambda: ReadModelMetadata(
            last_refreshed_at=datetime.now(UTC),
            last_refresh_duration_ms=0.0,
        )
    )

    @property
    def name(self) -> str:
        return "document_health"

    def is_fresh(self, *, now: datetime) -> bool:
        age = (now - self.metadata.last_refreshed_at).total_seconds()
        return age <= self.metadata.stale_after_seconds

    def health(self, *, now: datetime) -> ReadModelStatus:
        if self.metadata.last_error:
            return ReadModelStatus.FAILED
        if self.is_fresh(now=now):
            return ReadModelStatus.READY
        return ReadModelStatus.STALE

    def is_healthy(self) -> bool:
        """Return True if the pipeline is fully caught up."""
        return (
            self.ingestion_state == "completed"
            and self.embedding_state == "completed"
            and self.graph_state in {"completed", "disabled"}
            and self.failed_chunk_count == 0
            and self.pending_chunk_count == 0
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "tenant_id": str(self.tenant_id),
            "document_id": str(self.document_id),
            "ingestion_state": self.ingestion_state,
            "embedding_state": self.embedding_state,
            "graph_state": self.graph_state,
            "failed_chunk_count": self.failed_chunk_count,
            "pending_chunk_count": self.pending_chunk_count,
            "last_job_status": self.last_job_status,
            "last_job_error": self.last_job_error,
            "last_updated_at": self.last_updated_at.isoformat(),
            "is_healthy": self.is_healthy(),
        }
