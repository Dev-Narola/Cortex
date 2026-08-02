"""
SQLAlchemy ORM models for the billing bounded context.

Single table, ``usage_events``, matching the column shape in
``Docs/database.md`` and the database blueprint that the V3
plan called out as a forward-declared table. The
:func:`__repr__` is intentionally terse — these rows are
high-volume and verbose reprs hurt in pdb sessions.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    Index,
    Integer,
    String,
)
from sqlalchemy import Uuid as SAUuid
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base


# A closed set of allowed event types, mirrored in the
# application layer. The DB-side CHECK is a defence in
# depth — the application must already be using the
# ``EventType`` enum.
_ALLOWED_EVENT_TYPES: tuple[str, ...] = (
    "embedding",
    "completion",
    "rerank",
    "storage",
    "request",
)
_ALLOWED_UNIT_TYPES: tuple[str, ...] = (
    "tokens",
    "bytes",
    "units",
    "requests",
)


class UsageEventModel(Base):
    """ORM mapping for the ``usage_events`` table."""

    __tablename__ = "usage_events"

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    units: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    unit_type: Mapped[str] = mapped_column(String(16), nullable=False)
    cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # V4 Phase 11 — token accounting. The PRD rule
    # is "do not reconstruct this later from logs";
    # we store the input / output / total token
    # counts directly on the row.
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # V4 Phase 12 — pricing version snapshot. The
    # pricing table can change over time; we record
    # the version that was active when the cost was
    # computed so historical invoices are stable.
    pricing_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    __table_args__ = (
        # List "what did tenant X use in period Y".
        # Drives the /tenants/me/usage endpoint.
        Index(
            "ix_usage_events_tenant_created",
            "tenant_id",
            "created_at",
        ),
        # "What did tenant X spend on embeddings in
        #  period Y?" — composite index for event-type-scoped
        # queries.
        Index(
            "ix_usage_events_tenant_type_created",
            "tenant_id",
            "event_type",
            "created_at",
        ),
        CheckConstraint(
            f"event_type IN ({', '.join(repr(v) for v in _ALLOWED_EVENT_TYPES)})",
            name="ck_usage_events_event_type",
        ),
        CheckConstraint(
            f"unit_type IN ({', '.join(repr(v) for v in _ALLOWED_UNIT_TYPES)})",
            name="ck_usage_events_unit_type",
        ),
        CheckConstraint("units >= 0", name="ck_usage_events_units_nonneg"),
        CheckConstraint("cost_usd >= 0", name="ck_usage_events_cost_nonneg"),
        CheckConstraint(
            "input_tokens >= 0", name="ck_usage_events_input_tokens_nonneg"
        ),
        CheckConstraint(
            "output_tokens >= 0", name="ck_usage_events_output_tokens_nonneg"
        ),
        CheckConstraint(
            "total_tokens >= 0", name="ck_usage_events_total_tokens_nonneg"
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"UsageEventModel(id={self.id!r}, tenant_id={self.tenant_id!r}, "
            f"event_type={self.event_type!r}, units={self.units}, "
            f"cost_usd={self.cost_usd})"
        )


__all__ = ["UsageEventModel"]
