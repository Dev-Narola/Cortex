"""create documents

Revision ID: a1b2c3d4e5f6
Revises: e9c487b1711c
Create Date: 2026-07-22 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
# V4 hotfix — re-pointed from the baseline
# (``e9c487b1711c``) to the new identity-tables
# migration (``i1j2k3l4m5n6``) so the FKs on
# ``documents.tenant_id`` / ``documents.created_by``
# resolve to a real ``tenants`` / ``users`` table.
# See ``i1j2k3l4m5n6_create_identity_tables.py``
# for the rationale.
down_revision: str | None = "i1j2k3l4m5n6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """
    Create the `documents` table and its supporting indexes.

    Columns mirror `Docs/database.md`:

    * `id` UUID PK
    * `tenant_id` UUID NOT NULL, FK to `tenants.id`
    * `source_type` VARCHAR (enum-like, enforced by CHECK)
    * `title` VARCHAR(512) NOT NULL
    * `storage_uri` VARCHAR(1024) NULLABLE
    * `mime_type` VARCHAR(255) NOT NULL
    * `status` VARCHAR(16) NOT NULL (enum-like, enforced by CHECK)
    * `version` INT NOT NULL DEFAULT 1, CHECK (version >= 1)
    * `created_by` UUID NOT NULL, FK to `users.id`
    * `created_at` TIMESTAMPTZ NOT NULL

    Indexes:

    * `(tenant_id, created_at)` for tenant-scoped pagination
    * partial index on `status != 'indexed'` for the V2 worker
      polling query

    The partial-index clause uses both `postgresql_where` and
    `sqlite_where` so the same DDL works in dev (SQLite, used by
    the unit tests) and in production (PostgreSQL).
    """
    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("storage_uri", sa.String(length=1024), nullable=True),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name="fk_documents_created_by_users",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="fk_documents_tenant_id_tenants",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_documents"),
        sa.CheckConstraint(
            "status IN ('pending', 'parsing', 'chunking', "
            "'embedding', 'indexed', 'failed')",
            name="ck_documents_status",
        ),
        sa.CheckConstraint(
            "source_type IN ('upload', 'url', 'api')",
            name="ck_documents_source_type",
        ),
        sa.CheckConstraint(
            "version >= 1",
            name="ck_documents_version_positive",
        ),
    )

    # Tenant-scoped pagination: the most common list query is
    # "give me this tenant's documents, newest first".
    op.create_index(
        "ix_documents_tenant_id_created_at",
        "documents",
        ["tenant_id", "created_at"],
        unique=False,
    )

    # Worker polling: V2 will query
    #   SELECT ... WHERE status != 'indexed'
    # repeatedly. A partial index keeps that scan small even when
    # a tenant has many completed documents.
    op.create_index(
        "ix_documents_pending_status",
        "documents",
        ["status"],
        unique=False,
        postgresql_where=sa.text("status != 'indexed'"),
        sqlite_where=sa.text("status != 'indexed'"),
    )


def downgrade() -> None:
    """Drop the `documents` table and its indexes."""
    op.drop_index("ix_documents_pending_status", table_name="documents")
    op.drop_index("ix_documents_tenant_id_created_at", table_name="documents")
    op.drop_table("documents")
