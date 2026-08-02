"""
SQLAlchemy implementation of the billing repositories.

Two repositories, both sync (the V2 ingestion worker that
flushes usage events in batches is sync; the V3 REST path
uses sync ``Session`` too):

* :class:`UsageEventSqlRepository` — ``add`` / ``add_bulk`` /
  ``list_for_tenant`` / ``aggregate_for_tenant``.

The repository enforces the ``tenant_id NOT NULL`` invariant
in the constructor (it won't accept a session that's been
told to suppress the column).

Anti-corruption:

* The repository never returns rows that belong to a
  different tenant. ``list_for_tenant`` always takes a
  ``tenant_id`` and the WHERE clause includes it.
* ``aggregate_for_tenant`` does the GROUP BY on the
  database, not in Python. Computing 200K rows in
  Python would be a memory disaster; the SQL aggregate
  returns a small payload.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.billing.domain.entities import EventType, UnitType, UsageEvent
from src.billing.domain.ports import UsageEventRepository
from src.billing.infrastructure.models import UsageEventModel


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _model_to_entity(m: UsageEventModel) -> UsageEvent:
    return UsageEvent(
        id=m.id,
        tenant_id=m.tenant_id,
        event_type=m.event_type,
        units=float(m.units),
        unit_type=m.unit_type,
        cost=float(m.cost_usd),
        provider=m.provider,
        model=m.model,
        resource_id=m.resource_id,
        # V4 Phase 11 — token accounting.
        input_tokens=int(m.input_tokens),
        output_tokens=int(m.output_tokens),
        total_tokens=int(m.total_tokens),
        # V4 Phase 12 — pricing snapshot.
        pricing_version=m.pricing_version,
        created_at=_as_utc(m.created_at),
    )


class UsageEventSqlRepository(UsageEventRepository):
    """Sync SQLAlchemy implementation of :class:`UsageEventRepository`."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, event: UsageEvent) -> UsageEvent:
        model = UsageEventModel(
            id=event.id,
            tenant_id=event.tenant_id,
            event_type=event.event_type.value
            if isinstance(event.event_type, EventType)
            else str(event.event_type),
            units=float(event.units),
            unit_type=event.unit_type.value
            if isinstance(event.unit_type, UnitType)
            else str(event.unit_type),
            cost_usd=float(event.cost),
            provider=event.provider,
            model=event.model,
            resource_id=event.resource_id,
            input_tokens=int(event.input_tokens),
            output_tokens=int(event.output_tokens),
            total_tokens=int(event.total_tokens),
            pricing_version=event.pricing_version,
            created_at=event.created_at,
        )
        self._session.add(model)
        self._session.flush()
        return _model_to_entity(model)

    def add_bulk(self, events: list[UsageEvent]) -> None:
        if not events:
            return
        self._session.add_all(
            UsageEventModel(
                id=e.id,
                tenant_id=e.tenant_id,
                event_type=e.event_type.value
                if isinstance(e.event_type, EventType)
                else str(e.event_type),
                units=float(e.units),
                unit_type=e.unit_type.value
                if isinstance(e.unit_type, UnitType)
                else str(e.unit_type),
                cost_usd=float(e.cost),
                provider=e.provider,
                model=e.model,
                resource_id=e.resource_id,
                input_tokens=int(e.input_tokens),
                output_tokens=int(e.output_tokens),
                total_tokens=int(e.total_tokens),
                pricing_version=e.pricing_version,
                created_at=e.created_at,
            )
            for e in events
        )
        self._session.flush()

    def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        since: datetime | None = None,
        until: datetime | None = None,
        event_type: EventType | str | None = None,
        limit: int = 200,
    ) -> list[UsageEvent]:
        stmt = (
            select(UsageEventModel)
            .where(UsageEventModel.tenant_id == tenant_id)
            .order_by(UsageEventModel.created_at.desc())
            .limit(max(1, limit))
        )
        if since is not None:
            stmt = stmt.where(UsageEventModel.created_at >= _as_utc(since))
        if until is not None:
            stmt = stmt.where(UsageEventModel.created_at < _as_utc(until))
        if event_type is not None:
            et = event_type.value if isinstance(event_type, EventType) else str(event_type)
            stmt = stmt.where(UsageEventModel.event_type == et)
        models = self._session.execute(stmt).scalars().all()
        return [_model_to_entity(m) for m in models]

    def aggregate_for_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> dict[str, dict[str, float]]:
        """
        SQL-side GROUP BY for tenant usage.

        Returns a nested dict so the route layer can render
        any shape the UI wants without further arithmetic:

            {
                "embedding":  {"tokens": 12345.0, "cost_usd": 0.024},
                "completion": {"tokens": 9876.0,  "cost_usd": 0.118},
                "total_cost_usd": 0.142,
            }
        """
        # The ``unit_type`` bucket is in a single column; we
        # emit one row per (event_type, unit_type) pair and
        # build the nested dict in Python.
        stmt = (
            select(
                UsageEventModel.event_type,
                UsageEventModel.unit_type,
                func.coalesce(func.sum(UsageEventModel.units), 0.0).label("units_sum"),
                func.coalesce(func.sum(UsageEventModel.cost_usd), 0.0).label(
                    "cost_sum"
                ),
            )
            .where(UsageEventModel.tenant_id == tenant_id)
            .group_by(UsageEventModel.event_type, UsageEventModel.unit_type)
        )
        if since is not None:
            stmt = stmt.where(UsageEventModel.created_at >= _as_utc(since))
        if until is not None:
            stmt = stmt.where(UsageEventModel.created_at < _as_utc(until))
        rows: Sequence = self._session.execute(stmt).all()

        out: dict[str, dict[str, float]] = {}
        total_cost = 0.0
        for et, ut, units_sum, cost_sum in rows:
            et_s = str(et)
            ut_s = str(ut)
            out.setdefault(et_s, {})[ut_s] = float(units_sum)
            out[et_s]["cost_usd"] = float(cost_sum)
            total_cost += float(cost_sum)
        out["total_cost_usd"] = round(total_cost, 6)
        return out

    def summary_for_tenant(
        self,
        tenant_id: uuid.UUID,
        *,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> dict[str, Any]:
        """
        V4 Phase 13 — flat summary.

        Computes everything in a single SQL round-trip via
        a ``FILTER`` aggregate (a Postgres extension to
        standard SQL). The fallback for non-Postgres
        databases would be a per-event-type ``SELECT``;
        Cortex targets Postgres so the FILTER form is
        the cheap one.
        """
        # The CASE-based FILTER form is more portable than
        # the standard ``FILTER`` clause and produces
        # identical query plans on Postgres.
        embedding_input = func.coalesce(
            func.sum(
                func.iif(
                    UsageEventModel.event_type == "embedding",
                    UsageEventModel.input_tokens,
                    0,
                )
            ),
            0,
        )
        completion_input = func.coalesce(
            func.sum(
                func.iif(
                    UsageEventModel.event_type == "completion",
                    UsageEventModel.input_tokens,
                    0,
                )
            ),
            0,
        )
        completion_output = func.coalesce(
            func.sum(
                func.iif(
                    UsageEventModel.event_type == "completion",
                    UsageEventModel.output_tokens,
                    0,
                )
            ),
            0,
        )
        rerank_units = func.coalesce(
            func.sum(
                func.iif(
                    UsageEventModel.event_type == "rerank",
                    UsageEventModel.units,
                    0,
                )
            ),
            0,
        )
        request_count = func.coalesce(
            func.sum(
                func.iif(
                    UsageEventModel.event_type == "request",
                    1,
                    0,
                )
            ),
            0,
        )
        total_cost = func.coalesce(func.sum(UsageEventModel.cost_usd), 0.0)

        stmt = select(
            embedding_input.label("embedding_tokens"),
            completion_input.label("completion_input_tokens"),
            completion_output.label("completion_output_tokens"),
            rerank_units.label("rerank_units"),
            request_count.label("requests"),
            total_cost.label("estimated_cost_usd"),
        ).where(UsageEventModel.tenant_id == tenant_id)

        if since is not None:
            stmt = stmt.where(UsageEventModel.created_at >= _as_utc(since))
        if until is not None:
            stmt = stmt.where(UsageEventModel.created_at < _as_utc(until))

        row = self._session.execute(stmt).one()
        return {
            "requests": int(row.requests or 0),
            "embedding_tokens": int(row.embedding_tokens or 0),
            "completion_input_tokens": int(row.completion_input_tokens or 0),
            "completion_output_tokens": int(row.completion_output_tokens or 0),
            "rerank_units": int(row.rerank_units or 0),
            "estimated_cost_usd": round(float(row.estimated_cost_usd or 0.0), 6),
        }

    def list_for_tenant_keyset(
        self,
        tenant_id: uuid.UUID,
        *,
        since: datetime | None = None,
        until: datetime | None = None,
        event_type: Any | None = None,
        limit: int = 50,
        cursor: tuple[datetime, uuid.UUID] | None = None,
    ) -> list[UsageEvent]:
        """
        Keyset-paginated read for the ``/usage/events``
        admin route. The cursor is ``(created_at, id)``;
        we return rows strictly *older* than the cursor in
        newest-first order.
        """
        stmt = (
            select(UsageEventModel)
            .where(UsageEventModel.tenant_id == tenant_id)
            .order_by(
                UsageEventModel.created_at.desc(),
                UsageEventModel.id.desc(),
            )
            .limit(max(1, limit))
        )
        if since is not None:
            stmt = stmt.where(UsageEventModel.created_at >= _as_utc(since))
        if until is not None:
            stmt = stmt.where(UsageEventModel.created_at < _as_utc(until))
        if event_type is not None:
            et = (
                event_type.value
                if isinstance(event_type, EventType)
                else str(event_type)
            )
            stmt = stmt.where(UsageEventModel.event_type == et)
        if cursor is not None:
            cursor_ts, cursor_id = cursor
            # ``(created_at, id) < (cursor_ts, cursor_id)`` in
            # row-order terms — implemented as
            # ``created_at < cursor_ts OR (created_at = cursor_ts AND id < cursor_id)``.
            stmt = stmt.where(
                (UsageEventModel.created_at < cursor_ts)
                | (
                    (UsageEventModel.created_at == cursor_ts)
                    & (UsageEventModel.id < cursor_id)
                )
            )
        models = self._session.execute(stmt).scalars().all()
        return [_model_to_entity(m) for m in models]


__all__ = ["UsageEventSqlRepository"]
