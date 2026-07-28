"""create identity tables (tenants, users, api_keys)

Revision ID: i1j2k3l4m5n6
Revises: e9c487b1711c
Create Date: 2026-07-27 10:30:00.000000

Why this migration exists
-------------------------

The V3 migration chain started with a no-op baseline
(``e9c487b1711c``) and immediately went into the
``documents`` table. The ``documents`` migration has
foreign keys to ``tenants`` and ``users``, but no
migration *created* those tables — the project relied
on ``Base.metadata.create_all()`` in the test harness
to provision them, and on the same call inside the
running application to do it in dev. That is fine
for unit tests with an in-memory SQLite DB; it is not
fine for ``alembic upgrade head`` against a real
Postgres where the FKs are checked at DDL time.

This migration inserts the three identity tables
between the baseline and the documents migration so
``alembic upgrade head`` produces a complete schema
in a single transaction. The columns + indexes
mirror :mod:`src.identity.infrastructure.models` —
if the model changes, the change *and* this
migration need to move together.

The migration is intentionally verbose (no
``op.create_table(..., *[col for col in model.__table__.columns])``
shortcut) so the SQL it emits is reviewable as plain
DDL — that is what an operator reads when
investigating a schema diff in production.

Reverse compatibility
---------------------

``downgrade`` drops the three tables in reverse FK
order. There is no data to preserve; this migration
is the first time the tables exist in a real DB.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "i1j2k3l4m5n6"
down_revision: str | None = "e9c487b1711c"
# The next migration in the chain (``a1b2c3d4e5f6`` /
# ``create documents``) had its ``down_revision``
# repointed from ``e9c487b1711c`` (baseline) to this
# revision, so the chain is now:
#
#     baseline -> create_identity_tables ->
#         create_documents -> ... -> create_audit_log (head)
#
# This re-pointing is safe for the dev DB because no
# operator has run this chain against a real
# Postgres yet — the prior chain only ran against
# the test-harness in-memory SQLite (which is
# provisioned via ``Base.metadata.create_all`` and
# does not exercise alembic).
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create tenants, users, api_keys (in FK order)."""
    # --- tenants ---------------------------------------------------------
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=63), nullable=False),
        sa.Column("plan", sa.String(length=32), nullable=False, server_default="free"),
        # ``settings`` is JSON on SQLite (test suite) and JSONB on
        # Postgres (production). The model uses ``JSON`` (the
        # dialect-aware type), so we use ``JSON`` here too.
        sa.Column("settings", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_tenants_slug", "tenants", ["slug"], unique=True)

    # --- users -----------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="member"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])
    op.create_unique_constraint("uq_users_tenant_email", "users", ["tenant_id", "email"])

    # --- api_keys --------------------------------------------------------
    op.create_table(
        "api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("key_hash", sa.String(length=255), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_api_keys_tenant_id", "api_keys", ["tenant_id"])
    op.create_index(
        "ix_api_keys_tenant_key_hash", "api_keys", ["tenant_id", "key_hash"]
    )


def downgrade() -> None:
    """Drop api_keys, users, tenants (reverse FK order)."""
    op.drop_index("ix_api_keys_tenant_key_hash", table_name="api_keys")
    op.drop_index("ix_api_keys_tenant_id", table_name="api_keys")
    op.drop_table("api_keys")
    op.drop_constraint("uq_users_tenant_email", "users", type_="unique")
    op.drop_index("ix_users_tenant_id", table_name="users")
    op.drop_table("users")
    op.drop_index("ix_tenants_slug", table_name="tenants")
    op.drop_table("tenants")
