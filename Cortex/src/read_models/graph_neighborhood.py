"""
``GraphNeighborhood`` read model.

V9 Part 1 Task 6.

Per-entity adjacency cache used by the graph traversal hot path.
``GraphTraversalService.neighbors`` historically ran the
recursive CTE on every request; the projection pre-computes the
1-hop and 2-hop neighbourhood for "popular" entities and
invalidates the cache on entity / relationship writes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from src.read_models.base import ReadModelMetadata, ReadModelProtocol, ReadModelStatus


@dataclass(frozen=True, kw_only=True)
class GraphNeighborhoodEdge:
    """One outgoing edge in the cached neighbourhood."""

    target_id: UUID
    target_name: str
    target_type: str
    relationship: str
    confidence: float


@dataclass(frozen=True, kw_only=True)
class GraphNeighborhood:
    """Cached 1-hop neighbourhood of one entity."""

    tenant_id: UUID
    entity_id: UUID
    entity_name: str
    entity_type: str
    edges: tuple[GraphNeighborhoodEdge, ...]
    edge_count: int
    metadata: ReadModelMetadata = field(
        default_factory=lambda: ReadModelMetadata(
            last_refreshed_at=datetime.now(UTC),
            last_refresh_duration_ms=0.0,
        )
    )

    @property
    def name(self) -> str:
        return "graph_neighborhood"

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
            "entity_id": str(self.entity_id),
            "entity_name": self.entity_name,
            "entity_type": self.entity_type,
            "edge_count": self.edge_count,
            "edges": [
                {
                    "target_id": str(e.target_id),
                    "target_name": e.target_name,
                    "target_type": e.target_type,
                    "relationship": e.relationship,
                    "confidence": e.confidence,
                }
                for e in self.edges
            ],
            "last_refreshed_at": self.metadata.last_refreshed_at.isoformat(),
        }
