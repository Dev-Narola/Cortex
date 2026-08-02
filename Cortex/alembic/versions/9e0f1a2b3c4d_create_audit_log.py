"""create audit log

Revision ID: 9e0f1a2b3c4d
Revises: 8d9e0f1a2b3c
Create Date: 2026-07-25 19:30:00.000000

Adds the ``audit_log`` table that the V4 PRD requires
(Phase 15). The table is **append-only** by application
contract — the model has no ``updated_at`` column, and
the repository exposes only ``append()`` and
``list_for_tenant()``.

Columns mirror the V4 spec:

* ``id``              — UUID PK
* ``tenant_id``       — UUID NOT NULL (per-tenant)
* ``action``          — closed-set string NOT NULL
* ``actor_user_id``   — UUID NULL (system actions allowed)
* ``actor_api_key_id``— UUID NULL
* ``resource_type``   — closed-set string NULL
* ``resource_id``     — opaque string NULL
* ``metadata_json``   — JSONB NOT NULL default ``{}``
* ``ip_address``      — string NULL (v4 / v6)
* ``created_at``      — timestamptz NOT NULL

Indexes:

* ``(tenant_id, created_at)`` — admin feed
* ``(tenant_id, action, created_at)`` — action-scoped
* ``(tenant_id, actor_user_id, created_at)`` — actor-scoped
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "9e0f1a2b3c4d"
down_revision: str | None = "8d9e0f1a2b3c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_ALLOWED_ACTIONS: tuple[str, ...] = (
    "document_created",
    "document_accessed",
    "document_deleted",
    "document_ingestion_started",
    "document_ingestion_completed",
    "document_ingestion_failed",
    "api_key_created",
    "api_key_revoked",
    "tenant_created",
    "tenant_updated",
    "user_invited",
    "user_updated",
    "user_removed",
    "role_changed",
    "conversation_created",
    "conversation_accessed",
    "conversation_deleted",
    "login_success",
    "login_failure",
    "logout",
)

_ALLOWED_RESOURCE_TYPES: tuple[str, ...] = (
    "document",
    "chunk",
    "api_key",
    "tenant",
    "user",
    "role",
    "conversation",
    "message",
    "session",
)


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("actor_api_key_id", sa.Uuid(), nullable=True),
        sa.Column("resource_type", sa.String(length=32), nullable=True),
        sa.Column("resource_id", sa.String(length=128), nullable=True),
        sa.Column(
            "metadata_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_audit_log"),
        sa.ForeignKeyConstraint(
            ["tenant_id"], ["tenants.id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            f"action IN ({', '.join(repr(a) for a in _ALLOWED_ACTIONS)})",
            name="ck_audit_log_action",
        ),
        sa.CheckConstraint(
            "resource_type IS NULL OR "
            f"resource_type IN ({', '.join(repr(r) for r in _ALLOWED_RESOURCE_TYPES)})",
            name="ck_audit_log_resource_type",
        ),
    )
    op.create_index(
        "ix_audit_log_tenant_created",
        "audit_log",
        ["tenant_id", "created_at"],
    )
    op.create_index(
        "ix_audit_log_tenant_action_created",
        "audit_log",
        ["tenant_id", "action", "created_at"],
    )
    op.create_index(
        "ix_audit_log_tenant_actor_created",
        "audit_log",
        ["tenant_id", "actor_user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_audit_log_tenant_actor_created", table_name="audit_log"
    )
    op.drop_index(
        "ix_audit_log_tenant_action_created", table_name="audit_log"
    )
    op.drop_index("ix_audit_log_tenant_created", table_name="audit_log")
    op.drop_table("audit_log")
