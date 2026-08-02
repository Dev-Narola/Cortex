"""add usage event token columns and pricing version

Revision ID: 8d9e0f1a2b3c
Revises: 7c8d9e0f1a2b
Create Date: 2026-07-25 12:15:00.000000

Adds Phase 11 + Phase 12 columns to ``usage_events``:

* ``input_tokens``  — the prompt side of an LLM call
* ``output_tokens`` — the completion side
* ``total_tokens``  — the provider-reported total (the
  sum is computed in the application; the provider
  sometimes reports a different number because of
  cache reads, so we store what the provider says)
* ``pricing_version`` — the version of the rate table
  that was active when the cost was computed, so a
  historical event can be reconciled against the
  pricing that was in force at the time

All four columns are ``NOT NULL DEFAULT 0`` (or
``NULL`` for ``pricing_version``) so the migration is
backward-compatible with rows created by V4-alpha.

The PRD rule (Phase 11) is: "Do not reconstruct this
later from logs. Store input_tokens, output_tokens,
total_tokens on the event itself." That's what this
migration makes possible.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "8d9e0f1a2b3c"
down_revision: str | None = "7c8d9e0f1a2b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "usage_events",
        sa.Column(
            "input_tokens",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "usage_events",
        sa.Column(
            "output_tokens",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "usage_events",
        sa.Column(
            "total_tokens",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "usage_events",
        sa.Column(
            "pricing_version",
            sa.String(length=32),
            nullable=True,
        ),
    )
    # CHECK constraints to mirror the entity-level
    # non-negative guard. Defence in depth — a buggy
    # future migration that writes negative token
    # counts will fail loudly at the DB boundary.
    op.create_check_constraint(
        "ck_usage_events_input_tokens_nonneg",
        "usage_events",
        "input_tokens >= 0",
    )
    op.create_check_constraint(
        "ck_usage_events_output_tokens_nonneg",
        "usage_events",
        "output_tokens >= 0",
    )
    op.create_check_constraint(
        "ck_usage_events_total_tokens_nonneg",
        "usage_events",
        "total_tokens >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_usage_events_total_tokens_nonneg", table_name="usage_events"
    )
    op.drop_constraint(
        "ck_usage_events_output_tokens_nonneg", table_name="usage_events"
    )
    op.drop_constraint(
        "ck_usage_events_input_tokens_nonneg", table_name="usage_events"
    )
    op.drop_column("usage_events", "pricing_version")
    op.drop_column("usage_events", "total_tokens")
    op.drop_column("usage_events", "output_tokens")
    op.drop_column("usage_events", "input_tokens")
