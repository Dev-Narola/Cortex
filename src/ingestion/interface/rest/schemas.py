import uuid
from datetime import datetime

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


class DocumentAcceptedResponse(BaseModel):
    """Response returned upon successfully accepting a document for async processing."""

    id: uuid.UUID
    status: DocumentStatus
    message: str = "Document queued for processing"

    model_config = ConfigDict(from_attributes=True)


class DocumentStatusProgress(BaseModel):
    """Optional progress detail within a status response."""

    stage: str
    chunks_created: int | None = None


class DocumentStatusResponse(BaseModel):
    """
    Detailed status response for async polling.

    Clients poll GET /documents/{id}/status after upload.
    The lifecycle is:  pending → parsing → chunking → indexed | failed
    """

    document_id: uuid.UUID
    status: DocumentStatus
    retry_count: int = 0
    progress: DocumentStatusProgress | None = None
    error: str | None = None


class PaginatedDocumentResponse(BaseModel):
    """Paginated list of documents."""

    items: list[DocumentResponse]
    total: int
    limit: int
    offset: int
