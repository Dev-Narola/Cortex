"""api_keys: indexed SHA-256 lookup, issuer, per-key rate limit (audit C4/C5, FR-AUTH-02).

* ``key_lookup``  - SHA-256 hex of the raw key, unique. Authentication becomes
  one indexed query instead of bcrypt-checking every key of every tenant.
  Keys created before this migration have no lookup and must be re-issued
  (production had 0 API keys at migration time).
* ``created_by``  - issuing user; documents uploaded with the key are
  attributed to them (``documents.created_by`` is a NOT NULL FK).
* ``rate_limit_per_min`` - optional per-key request limit.

Revision ID: w3_api_key_lookup
Revises: w2_conversation_summary_marker
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "w3_api_key_lookup"
down_revision: str | Sequence[str] | None = "w2_conversation_summary_marker"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("api_keys", sa.Column("key_lookup", sa.String(64), nullable=True))
    op.add_column(
        "api_keys",
        sa.Column(
            "created_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("api_keys", sa.Column("rate_limit_per_min", sa.Integer(), nullable=True))
    op.create_index("uq_api_keys_key_lookup", "api_keys", ["key_lookup"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_api_keys_key_lookup", table_name="api_keys")
    op.drop_column("api_keys", "rate_limit_per_min")
    op.drop_column("api_keys", "created_by")
    op.drop_column("api_keys", "key_lookup")
