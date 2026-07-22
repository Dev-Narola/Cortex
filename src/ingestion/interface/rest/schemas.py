from datetime import datetime
import uuid
from pydantic import BaseModel, ConfigDict
from src.ingestion.domain.entities import DocumentStatus


class DocumentResponse(BaseModel):
    """Public representation of a Document."""
    id: uuid.UUID
    title: str
    mime_type: str
    status: DocumentStatus
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class DocumentStatusResponse(BaseModel):
    """Minimal response containing just the document's status."""
    document_id: uuid.UUID
    status: DocumentStatus


class PaginatedDocumentResponse(BaseModel):
    """Paginated list of documents."""
    items: list[DocumentResponse]
    total: int
    limit: int
    offset: int
