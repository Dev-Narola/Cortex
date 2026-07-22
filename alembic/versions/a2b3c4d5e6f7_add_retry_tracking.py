"""Add retry tracking and processing attempts

Revision ID: a2b3c4d5e6f7
Revises: f1g2h3i4j5k6
Create Date: 2026-07-22 10:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: str | None = "f1g2h3i4j5k6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add retry tracking columns to documents
    op.add_column(
        "documents",
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "documents",
        sa.Column("last_error", sa.String(length=1024), nullable=True),
    )

    # 2. Create document_processing_attempts table
    op.create_table(
        "document_processing_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.String(length=1024), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name="fk_processing_attempts_document_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="fk_processing_attempts_tenant_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_document_processing_attempts"),
        sa.CheckConstraint(
            "status IN ('running', 'succeeded', 'failed')",
            name="ck_processing_attempts_status",
        ),
    )
    op.create_index(
        "ix_processing_attempts_document",
        "document_processing_attempts",
        ["document_id"],
    )
    op.create_index(
        "ix_processing_attempts_tenant",
        "document_processing_attempts",
        ["tenant_id", "document_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_processing_attempts_tenant", table_name="document_processing_attempts")
    op.drop_index("ix_processing_attempts_document", table_name="document_processing_attempts")
    op.drop_table("document_processing_attempts")
    op.drop_column("documents", "last_error")
    op.drop_column("documents", "retry_count")
