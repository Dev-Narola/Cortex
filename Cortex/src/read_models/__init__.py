"""
Read models — derived views optimised for query workloads.

V9 Part 1 Task 6.

A read model is a *projection* of one or more domain entities into a
shape that is cheap to query. It is **not** a source of truth: writes
go to the underlying domain tables; the read model is refreshed by
:class:`src.platform.projections.ProjectionService`.

The Cortex platform ships a small, opinionated set of read models that
cover the hottest query paths:

* :class:`KnowledgeSummary` — per-document roll-up used by the
  list/search UI. Avoids the 12-table join that ``KnowledgeRepository.list``
  historically issued.
* :class:`DocumentHealth` — per-document ingestion/embedding health
  indicator used by the dashboard. Powers "stuck" alerts and
  customer-success follow-ups.
* :class:`TenantUsageRollup` — per-tenant, per-day usage counters
  for billing. The on-line alternative is a windowed aggregate over
  the raw usage table; the read model pre-computes it.
* :class:`GraphNeighborhood` — per-entity adjacency cache for the
  graph traversal hot path. Avoids the recursive CTE round-trip
  when the same entity is asked about repeatedly.
* :class:`AgentPerformance` — per-agent success/latency counters
  used by the agent observability dashboard.

All read models share a common interface (see
:class:`ReadModelProtocol`) so the projection service can
fan-out refreshes uniformly.
"""

from __future__ import annotations

from src.read_models.base import (
    ReadModelProtocol,
    ReadModelStatus,
    StaleReadModelError,
)
from src.read_models.knowledge_summary import KnowledgeSummary
from src.read_models.document_health import DocumentHealth
from src.read_models.tenant_usage import TenantUsageRollup
from src.read_models.graph_neighborhood import GraphNeighborhood
from src.read_models.agent_performance import AgentPerformance

__all__ = [
    "ReadModelProtocol",
    "ReadModelStatus",
    "StaleReadModelError",
    "KnowledgeSummary",
    "DocumentHealth",
    "TenantUsageRollup",
    "GraphNeighborhood",
    "AgentPerformance",
]
