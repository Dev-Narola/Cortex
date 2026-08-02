"""create usage events

Revision ID: 7c8d9e0f1a2b
Revises: d04887b3eb7e
Create Date: 2026-07-25 12:00:00.000000

Adds the ``usage_events`` table that the V4 PRD requires:

* every embedding / completion / rerank call records one
  row with a tenant_id, event_type, unit count, unit type,
  estimated cost (USD), and a small denormalised
  provider/model so per-tenant usage queries don't need to
  join the embedding/LLM tables;
* the table is partitioned by month in V5 (the PRD notes
  "partition by month once volume justifies it"). V4 ships
  the indexes that the per-tenant / per-period queries need.

Index strategy:

* ``(tenant_id, created_at)`` — list "what did this tenant
  use in period X?". Drives the ``GET /tenants/me/usage``
  endpoint.
* ``(tenant_id, event_type, created_at)`` — list "what did
  this tenant spend on *embeddings* in period X?". Drives
  the "break down by operation" UI.

Tenant scope is enforced by the column being ``NOT NULL``
plus the application layer's read-time WHERE clause; there
is intentionally no way to query across tenants.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "7c8d9e0f1a2b"
down_revision: str | None = "d04887b3eb7e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


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


def upgrade() -> None:
    op.create_table(
        "usage_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("units", sa.Float(), nullable=False, server_default="0"),
        sa.Column("unit_type", sa.String(length=16), nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("provider", sa.String(length=64), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("resource_id", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_usage_events"),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            f"event_type IN ({', '.join(repr(v) for v in _ALLOWED_EVENT_TYPES)})",
            name="ck_usage_events_event_type",
        ),
        sa.CheckConstraint(
            f"unit_type IN ({', '.join(repr(v) for v in _ALLOWED_UNIT_TYPES)})",
            name="ck_usage_events_unit_type",
        ),
        sa.CheckConstraint("units >= 0", name="ck_usage_events_units_nonneg"),
        sa.CheckConstraint("cost_usd >= 0", name="ck_usage_events_cost_nonneg"),
    )
    op.create_index(
        "ix_usage_events_tenant_created",
        "usage_events",
        ["tenant_id", "created_at"],
    )
    op.create_index(
        "ix_usage_events_tenant_type_created",
        "usage_events",
        ["tenant_id", "event_type", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_usage_events_tenant_type_created", table_name="usage_events"
    )
    op.drop_index(
        "ix_usage_events_tenant_created", table_name="usage_events"
    )
    op.drop_table("usage_events")
