"""
SQLAlchemy ORM model for the ``tenant_limits`` table.

One row per tenant, holding the per-tenant caps for
*agent execution*. A separate ``tenants.settings`` JSONB
column already exists for general tenant configuration;
the ``tenant_limits`` table is dedicated to the
*enforcement* of per-tenant rate limits, with explicit
columns so the planner can index them and the rate
limiter can read with a single column lookup.

The split mirrors the project's existing pattern: the
``tenants`` table holds identity + general settings; the
``tenant_limits`` table holds the runtime caps the rate
limiter reads on every request. The two are 1:1 by
tenant_id.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy import Uuid as SAUuid
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base


class TenantLimitsModel(Base):
    """ORM mapping for the ``tenant_limits`` table.

    A row is created on demand the first time a tenant
    hits a rate-limited endpoint and the
    :class:`RateLimiter` decides to *create* the row
    with the platform defaults. A tenant that never hits
    a limit never has a row, which keeps the table small
    for the long tail of small tenants.
    """

    __tablename__ = "tenant_limits"

    # The PK is the tenant id directly. The 1:1
    # relationship to ``tenants`` makes the lookup
    # "give me this tenant's limits" a single index
    # read. The FK constraint enforces the relationship
    # at the database layer.
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Per-tenant API call cap. ``0`` or ``NULL`` would
    # mean "unlimited" but the column is NOT NULL with a
    # default — operators who want unlimited can set a
    # very large value. The contract is "requests per
    # minute on the API surface."
    requests_per_minute: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60
    )
    # Per-tenant monthly token cap for LLM calls.
    # ``0`` or negative values are rejected at the
    # service layer; this column is the persisted cap.
    token_limit: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1_000_000
    )
    # Per-tenant cap on *agent executions* (i.e. on
    # ``AgentRun`` starts) per hour. Distinct from
    # ``requests_per_minute`` so a tenant can have a
    # tight API rate but a more generous agent budget
    # if their use case is "occasional API call, long
    # agent run."
    agent_execution_limit: Mapped[int] = mapped_column(
        Integer, nullable=False, default=100
    )

    # ----- timestamps -------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


__all__ = ["TenantLimitsModel"]
