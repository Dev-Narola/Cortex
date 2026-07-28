"""add_chunk_tsvector_index

Revision ID: 4b5c6d7e8f90
Revises: 371b75583fd6
Create Date: 2026-07-24 14:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b5c6d7e8f90'
down_revision: str | None = '371b75583fd6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Rename existing index if it matches the one from the previous migration
        # or create the requested one.
        op.execute("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ix_document_chunks_tsv') THEN
                    ALTER INDEX ix_document_chunks_tsv RENAME TO document_chunks_tsv_gin_idx;
                ELSIF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'document_chunks_tsv_gin_idx') THEN
                    CREATE INDEX document_chunks_tsv_gin_idx ON document_chunks USING GIN(tsv);
                END IF;
            END
            $$;
        """)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER INDEX IF EXISTS document_chunks_tsv_gin_idx RENAME TO ix_document_chunks_tsv;")
