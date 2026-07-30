"""
SQLAlchemy ORM model for the ``agent_runs`` table.

One row per :class:`~src.execution.domain.entities.AgentRun`
event. The row is the audit record of an agent firing; the
:attr:`steps` JSONB column holds the per-step transcript
(the LLM's output, any tool calls, errors) so a historical
run is fully reproducible from a single row.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy import Uuid as SAUuid
from sqlalchemy.orm import Mapped, mapped_column

from src.core.database import Base


class AgentRunModel(Base):
    """ORM mapping for the ``agent_runs`` table."""

    __tablename__ = "agent_runs"

    # ----- identity ---------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The user who triggered the run. NOT a foreign key to
    # ``users.id`` so the run history survives the user
    # being removed (rare but possible). The run history is
    # an audit record, not a live permission.
    user_id: Mapped[uuid.UUID] = mapped_column(
        SAUuid(as_uuid=True), nullable=False, index=True
    )

    # ----- content ----------------------------------------------------------

    # The user-supplied input. Capped at 16 KB to keep the
    # row size bounded; longer inputs should be put in S3
    # and referenced by URL. The limit is enforced in the
    # service layer.
    input: Mapped[str] = mapped_column(String(16_384), nullable=False)
    # The run's final output. Empty until the run reaches
    # the COMPLETED state.
    output: Mapped[str] = mapped_column(String(16_384), nullable=False, default="")
    # Lifecycle state.
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="started", index=True
    )
    # The per-step transcript. JSONB on PostgreSQL / TEXT
    # on SQLite. The executor appends one entry per loop
    # iteration; the LLM's response, tool calls, and any
    # error are stored here for the run history.
    steps: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Total tokens consumed across all LLM calls in the
    # run. Surfaced to the usage-event stream and the
    # audit log on completion.
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # ----- timestamps -------------------------------------------------------

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ----- indexes ----------------------------------------------------------

    __table_args__ = (
        # ``(tenant_id, started_at DESC)`` is the "list this
        # tenant's recent runs" query.
        Index("ix_agent_runs_tenant_id_started_at", "tenant_id", "started_at"),
        # The delete-guard in ``DeleteAgentService`` asks
        # "is there a STARTED/RUNNING run for this agent?";
        # an index on (agent_id, status) makes the count
        # O(1) instead of a table scan.
        Index("ix_agent_runs_agent_id_status", "agent_id", "status"),
    )


__all__ = ["AgentRunModel"]
