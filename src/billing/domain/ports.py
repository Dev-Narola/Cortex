"""
Billing domain ports.

The application service depends on the
:class:`UsageEventRepository` protocol, not on a concrete
SQLAlchemy class. This keeps the test suite honest
(in-memory fakes work) and lets V4 swap the storage layer
without touching call sites.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Protocol

from src.billing.domain.entities import EventType, UsageEvent


class UsageEventRepository(Protocol):
    """
    Persistence boundary for :class:`UsageEvent`.

    Every method that takes ``tenant_id`` requires it as a
    keyword argument. There is intentionally no
    ``list_all()`` or other "list without scope" method —
    usage is always queried per tenant.
    """

    def add(self, event: UsageEvent) -> UsageEvent:
        """Persist a single event. Returns the event with
        ``created_at`` populated if it wasn't set by the
        caller (the application can pass an explicit
        timestamp for testing)."""
        ...

    def add_bulk(self, events: list[UsageEvent]) -> None:
        """Persist many events in one transaction. Used by
        the worker's usage-flush step when batching."""

    def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        since: datetime | None = None,
        until: datetime | None = None,
        event_type: EventType | str | None = None,
        limit: int = 200,
    ) -> list[UsageEvent]:
        """Read a tenant's events, newest first.

        ``since`` and ``until`` are inclusive lower / exclusive
        upper bounds; passing both yields a closed-open
        interval. ``event_type`` filters to a single kind of
        event (useful for "how much did I spend on
        embeddings this month"). ``limit`` defaults to 200
        which is enough for a per-tenant usage page; V5's
        UI can page through if it ever needs more.
        """

    def aggregate_for_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> dict[str, dict[str, float]]:
        """
        Return ``{event_type: {unit_type: sum_units}}`` plus
        ``cost_total`` for the tenant over the period.

        Used by the ``GET /tenants/me/usage`` endpoint to
        answer "what did I use this month?" in one DB
        round-trip.

        The cost and the units are computed server-side
        because the per-row ``cost`` is already known — the
        aggregator just sums the rows. No client-side
        arithmetic.
        """

    def summary_for_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> dict[str, Any]:
        """
        V4 Phase 13 — return a flat summary in the
        spec-shape consumed by the dashboard:

        * ``requests``              — count of REQUEST events
        * ``embedding_tokens``      — sum of input_tokens for embedding events
        * ``completion_input_tokens``  — sum of input_tokens for completion events
        * ``completion_output_tokens`` — sum of output_tokens for completion events
        * ``rerank_units``          — sum of units for rerank events
        * ``estimated_cost_usd``    — sum of cost_usd across all events
        """

    def list_for_tenant_keyset(
        self,
        tenant_id: uuid.UUID,
        *,
        since: datetime | None = None,
        until: datetime | None = None,
        event_type: EventType | str | None = None,
        limit: int = 50,
        cursor: tuple[datetime, uuid.UUID] | None = None,
    ) -> list[UsageEvent]:
        """
        V4 Phase 13 — keyset-paginated read for the
        ``/usage/events`` admin route. ``cursor`` is a
        ``(created_at, id)`` pair; the query returns rows
        strictly *older* than the cursor (newest-first
        ordering). ``limit`` is the page size; the route
        decides whether to issue a follow-up query.
        """


__all__ = ["UsageEventRepository"]
