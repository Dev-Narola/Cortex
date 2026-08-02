"""Merge V6 and V7 heads into a single head revision.

Revision ID: v7_merge_heads
Revises: v6_create_agents_tools_runs_tenant_limits, v7_create_knowledge_graph
Create Date: 2026-07-30 12:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "v7_merge_heads"
down_revision: str | Sequence[str] | None = (
    "v6_agentic_layer",
    "v7_create_knowledge_graph",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
