"""V6 — agentic layer tables.

Revision ID: v6_create_agents_tools_runs_tenant_limits
Revises: a2b3c4d5e6f7_add_retry_tracking
Create Date: 2026-07-29 12:00:00.000000

Adds the four V6 tables:

* ``agents``        — tenant-scoped agent definitions
* ``tools``         — tenant-scoped tool catalog (the
                      handler class is registered in
                      process; this table is the audit
                      record + the LLM-facing schema)
* ``agent_runs``    — execution history; one row per
                      :class:`AgentRun` event
* ``tenant_limits`` — per-tenant rate limit caps

The migration is ``upgrade`` only — a ``downgrade`` that
reverses a feature the rest of the system depends on
would be misleading. The standard downgrade drops the
four new tables in reverse order so a developer rolling
back locally gets a clean state.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "v6_create_agents_tools_runs_tenant_limits"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _uuid_column(**kwargs):
    """A UUID column that works on both PostgreSQL and SQLite.

    On PostgreSQL the dialect renders ``UUID`` natively;
    on SQLite (the dev / test target) it falls back to
    ``CHAR(36)`` via the ``Uuid`` type's
    ``as_uuid=True`` flag. The Alembic migration uses
    the same pattern as the rest of the project's
    existing migrations.
    """
    return sa.Column(
        "id",
        sa.dialects.postgresql.UUID(as_uuid=True)
        if op.get_bind().dialect.name == "postgresql"
        else sa.String(36),
        primary_key=True,
        nullable=False,
        **kwargs,
    )


def _json_column(name: str, **kwargs):
    """A JSON column with a sensible default.

    The ``agents.configuration`` column is a JSONB on
    PostgreSQL (the production target) and a TEXT
    column on SQLite. The default is an empty dict so
    a row can be created without a configuration
    payload.
    """
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        return sa.Column(name, postgresql.JSONB, **kwargs)
    return sa.Column(name, sa.JSON, **kwargs)


def _fk(table: str, column: str, ondelete: str = "CASCADE"):
    """A foreign key to the ``tenants`` table with the
    project's standard ``ondelete=CASCADE`` policy.

    A deleted tenant takes its agents / tools / runs /
    limits with it; the cascade is the cheapest way to
    keep the data consistent.
    """
    return sa.ForeignKeyConstraint(
        [column],
        [f"{table}.id"],
        ondelete=ondelete,
    )


def _now() -> sa.sql.expression.FunctionElement:
    """A server-side ``now()`` default.

    ``server_default=sa.func.now()`` is set on every
    ``created_at`` / ``updated_at`` so the application
    code can omit the timestamp on insert.
    """
    return sa.func.now()


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    # ----- agents --------------------------------------------------------
    op.create_table(
        "agents",
        _uuid_column(),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True)
            if op.get_bind().dialect.name == "postgresql"
            else sa.String(36),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(2000), nullable=False, server_default=""),
        sa.Column("system_prompt", sa.String, nullable=False),
        sa.Column("model", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        _json_column("configuration", nullable=False, server_default=sa.text("'{}'")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        _fk("tenants", "tenant_id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_agents_tenant_id_name"),
    )
    op.create_index("ix_agents_tenant_id", "agents", ["tenant_id"])
    op.create_index("ix_agents_status", "agents", ["status"])
    op.create_index(
        "ix_agents_tenant_id_deleted_at", "agents", ["tenant_id", "deleted_at"]
    )

    # ----- tools --------------------------------------------------------
    op.create_table(
        "tools",
        _uuid_column(),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True)
            if op.get_bind().dialect.name == "postgresql"
            else sa.String(36),
            nullable=False,
        ),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("description", sa.String(2000), nullable=False),
        # The JSON Schema document the LLM is shown.
        # Stored as ``schema`` on the model side; the
        # column name in the DB matches.
        _json_column("schema", nullable=False, server_default=sa.text("'{}'")),
        sa.Column("handler", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        _json_column("permissions", nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        _fk("tenants", "tenant_id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_tools_tenant_id_name"),
    )
    op.create_index("ix_tools_tenant_id", "tools", ["tenant_id"])
    op.create_index("ix_tools_tenant_id_status", "tools", ["tenant_id", "status"])

    # ----- agent_runs ---------------------------------------------------
    op.create_table(
        "agent_runs",
        _uuid_column(),
        sa.Column(
            "agent_id",
            sa.dialects.postgresql.UUID(as_uuid=True)
            if op.get_bind().dialect.name == "postgresql"
            else sa.String(36),
            nullable=False,
        ),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True)
            if op.get_bind().dialect.name == "postgresql"
            else sa.String(36),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.dialects.postgresql.UUID(as_uuid=True)
            if op.get_bind().dialect.name == "postgresql"
            else sa.String(36),
            nullable=False,
        ),
        sa.Column("input", sa.String(16_384), nullable=False),
        sa.Column("output", sa.String(16_384), nullable=False, server_default=""),
        sa.Column("status", sa.String(32), nullable=False, server_default="started"),
        _json_column("steps", nullable=False, server_default=sa.text("'[]'")),
        sa.Column("total_tokens", sa.Integer, nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        _fk("tenants", "tenant_id"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_agent_runs_agent_id", "agent_runs", ["agent_id"])
    op.create_index("ix_agent_runs_tenant_id", "agent_runs", ["tenant_id"])
    op.create_index("ix_agent_runs_user_id", "agent_runs", ["user_id"])
    op.create_index("ix_agent_runs_status", "agent_runs", ["status"])
    op.create_index(
        "ix_agent_runs_tenant_id_started_at", "agent_runs", ["tenant_id", "started_at"]
    )
    op.create_index(
        "ix_agent_runs_agent_id_status", "agent_runs", ["agent_id", "status"]
    )

    # ----- tenant_limits -------------------------------------------------
    op.create_table(
        "tenant_limits",
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True)
            if op.get_bind().dialect.name == "postgresql"
            else sa.String(36),
            primary_key=True,
        ),
        sa.Column("requests_per_minute", sa.Integer, nullable=False, server_default="60"),
        sa.Column("token_limit", sa.Integer, nullable=False, server_default="1000000"),
        sa.Column("agent_execution_limit", sa.Integer, nullable=False, server_default="100"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_now()),
        _fk("tenants", "tenant_id"),
    )


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    # Reverse order so the FK chain unwinds cleanly.
    op.drop_table("tenant_limits")
    op.drop_table("agent_runs")
    op.drop_table("tools")
    op.drop_table("agents")
