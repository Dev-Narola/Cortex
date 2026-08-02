"""V8: Create MCP sessions and clients tables.

Revision ID: v8_create_mcp_tables
Revises: v7_merge_heads
Create Date: 2026-07-30 15:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "v8_create_mcp_tables"
down_revision: str | Sequence[str] | None = "v7_merge_heads"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- mcp_clients ---
    op.create_table(
        "mcp_clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("client_type", sa.String(50), nullable=False, server_default="custom"),
        sa.Column("version", sa.String(50), nullable=False, server_default="1.0.0"),
        sa.Column("allowed_capabilities", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("allowed_tools", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("allowed_resources", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_mcp_clients_tenant_id", "mcp_clients", ["tenant_id"])
    op.create_index("ix_mcp_clients_tenant_name", "mcp_clients", ["tenant_id", "name"], unique=True)

    # --- mcp_sessions ---
    op.create_table(
        "mcp_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("client_version", sa.String(50), nullable=False, server_default="1.0.0"),
        sa.Column("transport", sa.String(50), nullable=False, server_default="websocket"),
        sa.Column("state", sa.String(50), nullable=False, server_default="initializing"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_activity", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("session_metadata", postgresql.JSONB, nullable=False, server_default="{}"),
    )
    op.create_index("ix_mcp_sessions_tenant_id", "mcp_sessions", ["tenant_id"])
    op.create_index("ix_mcp_sessions_client_id", "mcp_sessions", ["client_id"])
    op.create_index("ix_mcp_sessions_tenant_state", "mcp_sessions", ["tenant_id", "state"])


def downgrade() -> None:
    op.drop_table("mcp_sessions")
    op.drop_table("mcp_clients")
