"""
``KnowledgeSummary`` read model.

V9 Part 1 Task 6.

Pre-computed per-document roll-up that the document list and
search UI use. Replaces a 12-table join that the original
``KnowledgeRepository.list`` issued; the projection is refreshed
on document create / update / delete and on chunk / embedding
writes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from src.read_models.base import ReadModelMetadata, ReadModelProtocol, ReadModelStatus


@dataclass(frozen=True, kw_only=True)
class KnowledgeSummary:
    """Per-document summary used by the list / search UI.

    Fields are deliberately flat — the read model is meant to be
    cheap to serialise into a JSON response and to render in a
    table view without further joining.
    """

    tenant_id: UUID
    document_id: UUID
    title: str
    owner_id: UUID
    owner_email: str
    source: str
    status: str
    chunk_count: int
    embedding_count: int
    indexed_chunk_count: int
    has_failed_chunks: bool
    size_bytes: int
    tags: tuple[str, ...]
    updated_at: datetime
    metadata: ReadModelMetadata = field(
        default_factory=lambda: ReadModelMetadata(
            last_refreshed_at=datetime.now(UTC),
            last_refresh_duration_ms=0.0,
        )
    )

    @property
    def name(self) -> str:
        return "knowledge_summary"

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
            "document_id": str(self.document_id),
            "title": self.title,
            "owner_id": str(self.owner_id),
            "owner_email": self.owner_email,
            "source": self.source,
            "status": self.status,
            "chunk_count": self.chunk_count,
            "embedding_count": self.embedding_count,
            "indexed_chunk_count": self.indexed_chunk_count,
            "has_failed_chunks": self.has_failed_chunks,
            "size_bytes": self.size_bytes,
            "tags": list(self.tags),
            "updated_at": self.updated_at.isoformat(),
            "last_refreshed_at": self.metadata.last_refreshed_at.isoformat(),
        }
