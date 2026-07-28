import uuid
from sqlalchemy import func, update
from sqlalchemy.orm import Session

from src.ingestion.infrastructure.models import DocumentChunkModel


def populate_tsvector(session: Session, language: str = "english"):
    """
    Populates the `tsv` column for all DocumentChunks using
    to_tsvector on the `content` field.
    """
    # Using raw SQL for efficient bulk update of the tsvector
    # PostgreSQL specific function: to_tsvector(config, text)
    update_stmt = update(DocumentChunkModel).values(
        tsv=func.to_tsvector(language, DocumentChunkModel.content)
    )
    session.execute(update_stmt)
    session.commit()
