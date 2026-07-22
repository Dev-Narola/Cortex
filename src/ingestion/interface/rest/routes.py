import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from src.ingestion.application.services import (
    CreateDocumentService,
    DeleteDocumentService,
    GetDocumentService,
    GetDocumentStatusService,
    ListDocumentsService,
)
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.ingestion.infrastructure.s3_storage import S3Storage
from src.ingestion.interface.rest.auth import (
    require_document_read,
    require_document_write,
)
from src.ingestion.interface.rest.schemas import (
    DocumentResponse,
    DocumentStatusResponse,
    PaginatedDocumentResponse,
)
from src.platform.database import get_db

router = APIRouter(prefix="/documents", tags=["documents"])


def get_document_repository(db: Session = Depends(get_db)) -> DocumentRepository:
    return DocumentRepository(db)


def get_s3_storage() -> S3Storage:
    from src.platform.config import settings

    return S3Storage(
        bucket=settings.S3_BUCKET or "cortex-documents-dev-2026",
        endpoint_url=settings.S3_ENDPOINT,
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
    )


def get_create_document_service(
    repo: DocumentRepository = Depends(get_document_repository),
    storage: S3Storage = Depends(get_s3_storage),
) -> CreateDocumentService:
    return CreateDocumentService(repo, storage)


def get_list_documents_service(
    repo: DocumentRepository = Depends(get_document_repository),
) -> ListDocumentsService:
    return ListDocumentsService(repo)


def get_get_document_service(
    repo: DocumentRepository = Depends(get_document_repository),
) -> GetDocumentService:
    return GetDocumentService(repo)


def get_delete_document_service(
    repo: DocumentRepository = Depends(get_document_repository),
    storage: S3Storage = Depends(get_s3_storage),
) -> DeleteDocumentService:
    return DeleteDocumentService(repo, storage)


def get_document_status_service(
    repo: DocumentRepository = Depends(get_document_repository),
) -> GetDocumentStatusService:
    return GetDocumentStatusService(repo)


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(
    file: UploadFile,
    tenant_id: Annotated[uuid.UUID, Depends(require_document_write)],
    db: Session = Depends(get_db),
    service: CreateDocumentService = Depends(get_create_document_service),
):
    """
    Upload a new document for ingestion.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is missing")

    document = service.execute(
        tenant_id=tenant_id,
        created_by=tenant_id,
        filename=file.filename,
        mime_type=file.content_type or "application/octet-stream",
        file_obj=file.file,
    )
    db.commit()
    return document


@router.get("", response_model=PaginatedDocumentResponse)
def list_documents(
    tenant_id: Annotated[uuid.UUID, Depends(require_document_read)],
    limit: int = 50,
    offset: int = 0,
    service: ListDocumentsService = Depends(get_list_documents_service),
):
    """
    List all documents for the current tenant.
    """
    documents, total = service.execute(tenant_id=tenant_id, limit=limit, offset=offset)
    return PaginatedDocumentResponse(
        items=documents,  # type: ignore
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: uuid.UUID,
    tenant_id: Annotated[uuid.UUID, Depends(require_document_read)],
    service: GetDocumentService = Depends(get_get_document_service),
):
    """
    Get a specific document by ID.
    """
    return service.execute(tenant_id=tenant_id, document_id=document_id)


@router.get("/{document_id}/status", response_model=DocumentStatusResponse)
def get_document_status(
    document_id: uuid.UUID,
    tenant_id: Annotated[uuid.UUID, Depends(require_document_read)],
    service: GetDocumentStatusService = Depends(get_document_status_service),
):
    """
    Get only the status of a specific document.
    """
    doc_status = service.execute(tenant_id=tenant_id, document_id=document_id)
    return DocumentStatusResponse(document_id=document_id, status=doc_status)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: uuid.UUID,
    tenant_id: Annotated[uuid.UUID, Depends(require_document_write)],
    db: Session = Depends(get_db),
    service: DeleteDocumentService = Depends(get_delete_document_service),
):
    """
    Delete a document and its associated storage object.
    """
    service.execute(tenant_id=tenant_id, document_id=document_id)
    db.commit()
    return None
