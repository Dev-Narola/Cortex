"""Embedding column -> halfvec(2048) for nvidia/nemotron-3-embed-1b.

The previous model (nvidia/nv-embedqa-e5-v5, 1024-d) was retired by NVIDIA
on 2026-08-25, so every stored vector became unusable: queries embedded by
any other model live in a different space. The only embedding model left
on the account outputs a fixed 2048 dims, above pgvector's 2000-dim HNSW
limit for ``vector`` but within the 4000-dim limit for ``halfvec``.

Destructive by necessity: existing embeddings are cleared (USING NULL) and
their documents are moved back to ``embedding`` so status stays truthful;
``scripts/reembed.py`` re-enqueues them. Chunks and text are untouched.
Also normalises schema drift: migration 371b75583fd6 created vector(1536)
while prod had been hand-altered to vector(1024).

Revision ID: w1_embedding_halfvec_2048
Revises: v8_create_mcp_tables
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "w1_embedding_halfvec_2048"
down_revision: str | Sequence[str] | None = "v8_create_mcp_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding")
    op.execute(
        "ALTER TABLE document_chunks ALTER COLUMN embedding TYPE halfvec(2048) USING NULL"
    )
    op.execute("UPDATE document_chunks SET embedding_model = NULL, embedding_version = NULL")
    op.execute(
        "UPDATE documents SET status = 'embedding' "
        "WHERE status = 'indexed' AND id IN (SELECT DISTINCT document_id FROM document_chunks)"
    )
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding ON document_chunks "
        "USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)"
    )


def downgrade() -> None:
    # Vectors are not restorable (their model is retired); re-embed after downgrading.
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding")
    op.execute(
        "ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1024) USING NULL"
    )
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding ON document_chunks "
        "USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)"
    )
