"""add_chunk_vector_columns_and_indices

Revision ID: 371b75583fd6
Revises: add9234e745c
Create Date: 2026-07-22 20:03:07.300991

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '371b75583fd6'
down_revision: str | None = 'add9234e745c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from src.ingestion.infrastructure.models import TSVector

def upgrade() -> None:
    # Add columns
    op.add_column("document_chunks", sa.Column("embedding_model", sa.String(64), nullable=True))
    op.add_column("document_chunks", sa.Column("embedding_version", sa.String(16), nullable=True))
    op.add_column("document_chunks", sa.Column("embedding", Vector(1536), nullable=True))
    
    # Add TSVECTOR column and update trigger
    op.add_column("document_chunks", sa.Column("tsv", TSVector(), nullable=True))
    
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("""
            CREATE OR REPLACE FUNCTION document_chunks_tsv_update() RETURNS trigger AS $$
            BEGIN
              new.tsv := to_tsvector('english', coalesce(new.content, ''));
              return new;
            END
            $$ LANGUAGE plpgsql;
        """)
        
        op.execute("""
            CREATE TRIGGER tsvectorupdate
            BEFORE INSERT OR UPDATE ON document_chunks
            FOR EACH ROW EXECUTE PROCEDURE document_chunks_tsv_update();
        """)
        
        # Backfill the TSVECTOR column
        op.execute("UPDATE document_chunks SET content = content;")
        
        # Create indexes
        op.create_index("ix_document_chunks_tsv", "document_chunks", ["tsv"], postgresql_using="gin")
        op.execute("""
            CREATE INDEX ix_document_chunks_embedding 
            ON document_chunks 
            USING hnsw (embedding vector_cosine_ops)
        """)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Drop indexes
        op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding")
        op.drop_index("ix_document_chunks_tsv", table_name="document_chunks")
        
        # Drop trigger and function
        op.execute("DROP TRIGGER IF EXISTS tsvectorupdate ON document_chunks")
        op.execute("DROP FUNCTION IF EXISTS document_chunks_tsv_update")
    
    # Drop columns
    op.drop_column("document_chunks", "tsv")
    op.drop_column("document_chunks", "embedding")
    op.drop_column("document_chunks", "embedding_version")
    op.drop_column("document_chunks", "embedding_model")
