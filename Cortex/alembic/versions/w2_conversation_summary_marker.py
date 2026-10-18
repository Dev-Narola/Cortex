"""conversations.summarized_through — marker for rolling summaries (FR-CHAT-02).

History is loaded from after this timestamp, so a message is never
summarized twice nor dropped without being summarized.

Revision ID: w2_conversation_summary_marker
Revises: w1_embedding_halfvec_2048
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "w2_conversation_summary_marker"
down_revision: str | Sequence[str] | None = "w1_embedding_halfvec_2048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("summarized_through", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversations", "summarized_through")
