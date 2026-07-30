"""v7_create_knowledge_graph

Revision ID: v7_create_knowledge_graph
Revises: 9e0f1a2b3c4d
Create Date: 2026-07-30 10:00:00.000000

V7 — Knowledge Graph tables (``kg_entities`` and ``kg_relations``).

Per the V1+V3 schema doc, the knowledge graph is stored in
Postgres. The indexes below mirror the inline declarations on
the ORM models in ``src/knowledge_graph/infrastructure/models.py``
so that a fresh ``Base.metadata.create_all`` run and an alembic
``upgrade head`` both produce the same shape.

Why an explicit migration (rather than relying on
``Base.metadata.create_all``): the production deploy
runs ``alembic upgrade head`` at container start
(``RUN_DB_MIGRATIONS_ON_START=true``); without this
migration the KG tables would not be created on an
existing database, and the API would 500 on every
``GET /graph/entities`` call.

A future V9 hardening item can swap this layer for
Neo4j by replacing the ORM models and the
``GraphDatabaseClient`` implementation; the
``infrastructure/indexes.cypher`` file in the same
package is the forward-compat Cypher equivalent of
the indexes declared below.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "v7_create_knowledge_graph"
down_revision: str | None = "9e0f1a2b3c4d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- kg_entities --------------------------------------------------
    op.create_table(
        "kg_entities",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "tenant_id",
            sa.Uuid(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column(
            "description",
            sa.String(length=2000),
            nullable=False,
            server_default="",
        ),
        sa.Column("properties", sa.JSON(), nullable=False),
        sa.Column(
            "canonical_id",
            sa.Uuid(),
            sa.ForeignKey("kg_entities.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "source_chunk_id",
            sa.Uuid(),
            sa.ForeignKey("document_chunks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_kg_entities_tenant_id",
        "kg_entities",
        ["tenant_id"],
    )
    op.create_index(
        "ix_kg_entities_entity_type",
        "kg_entities",
        ["entity_type"],
    )
    op.create_index(
        "ix_kg_entities_canonical_id",
        "kg_entities",
        ["canonical_id"],
    )
    op.create_index(
        "ix_kg_entities_source_chunk_id",
        "kg_entities",
        ["source_chunk_id"],
    )
    op.create_unique_constraint(
        "uq_kg_entities_tenant_name_type",
        "kg_entities",
        ["tenant_id", "name", "entity_type"],
    )

    # --- kg_relations -------------------------------------------------
    op.create_table(
        "kg_relations",
        sa.Column("id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column(
            "tenant_id",
            sa.Uuid(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_entity_id",
            sa.Uuid(),
            sa.ForeignKey("kg_entities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "target_entity_id",
            sa.Uuid(),
            sa.ForeignKey("kg_entities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "relationship_type",
            sa.String(length=32),
            nullable=False,
        ),
        sa.Column("properties", sa.JSON(), nullable=False),
        sa.Column(
            "confidence",
            sa.Float(),
            nullable=False,
            server_default="1.0",
        ),
        sa.Column(
            "source_chunk_id",
            sa.Uuid(),
            sa.ForeignKey("document_chunks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_kg_relations_tenant_id",
        "kg_relations",
        ["tenant_id"],
    )
    op.create_index(
        "ix_kg_relations_relationship_type",
        "kg_relations",
        ["relationship_type"],
    )
    op.create_index(
        "ix_kg_relations_source_target",
        "kg_relations",
        ["source_entity_id", "target_entity_id"],
    )
    op.create_unique_constraint(
        "uq_kg_relations_edge",
        "kg_relations",
        ["source_entity_id", "target_entity_id", "relationship_type"],
    )


def downgrade() -> None:
    op.drop_table("kg_relations")
    op.drop_table("kg_entities")
