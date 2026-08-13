import logging
import uuid
from typing import BinaryIO, Protocol

from src.ingestion.application.validators import FileValidator
from src.ingestion.domain.entities import Document, DocumentStatus
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.ingestion.infrastructure.storage import ObjectStorage
from src.shared.exceptions import NotFoundException

logger = logging.getLogger(__name__)


class QueueClient(Protocol):
    """
    Minimal async-queue interface the upload service depends on.

    The concrete implementation (ArqQueue) lives in the interface layer
    so the application layer has zero direct dependency on Arq.
    """

    async def enqueue(self, task_name: str, **kwargs: object) -> None:
        """Enqueue a named task with keyword arguments."""
        ...


class CreateDocumentService:
    """Orchestrates the creation and upload of a document."""

    def __init__(
        self,
        repository: DocumentRepository,
        storage: ObjectStorage,
        queue: QueueClient | None = None,
    ):
        self.repository = repository
        self.storage = storage
        self._queue = queue

    async def execute(
        self,
        tenant_id: uuid.UUID,
        created_by: uuid.UUID,
        filename: str,
        mime_type: str,
        file_obj: BinaryIO,
    ) -> Document:
        # 1. Validate file
        FileValidator.validate_file(filename=filename, mime_type=mime_type, file_obj=file_obj)
        file_obj.seek(0)

        # 2. Build domain entity and persist immediately with PENDING status
        document = Document.create(
            tenant_id=tenant_id,
            source_type="upload",
            title=filename,
            mime_type=mime_type,
            created_by=created_by,
        )
        persisted = self.repository.create(document)

        # tenants/{tenant_id}/documents/{document_id}/original/{filename}
        object_key = f"tenants/{tenant_id}/documents/{persisted.id}/original/{filename}"

        # 3. Upload file; on failure mark the DB record as failed and re-raise
        try:
            storage_uri = self.storage.upload(
                data=file_obj,
                uri=object_key,
                content_type=mime_type,
            )
        except Exception as exc:
            logger.error("Failed to upload document %s: %s", persisted.id, exc)
            self.repository.update_status(
                persisted.id,
                tenant_id=tenant_id,
                status=DocumentStatus.FAILED,
            )
            from src.ingestion.infrastructure.s3_storage import S3Storage
            if isinstance(self.storage, S3Storage):
                try:
                    from src.ingestion.infrastructure.storage import LocalStorage
                    fallback = LocalStorage()
                    storage_uri = fallback.upload(
                        data=file_obj,
                        uri=object_key,
                        content_type=mime_type,
                    )
                    logger.info("Fallback to LocalStorage succeeded for document %s", persisted.id)
                except Exception as fallback_exc:
                    logger.error("LocalStorage fallback also failed: %s", fallback_exc)
                    raise exc
            else:
                raise

        # 4. Persist storage URI; update in-memory entity so callers see it
        self.repository.update_storage_uri(
            persisted.id, tenant_id=tenant_id, storage_uri=storage_uri
        )
        persisted.set_storage_uri(storage_uri)

        # 5. Enqueue background ingestion task — fire and forget.
        if self._queue is not None:
            try:
                await self._queue.enqueue(
                    "ingest_document_task",
                    document_id=str(persisted.id),
                    tenant_id=str(tenant_id),
                )
                logger.info("Enqueued ingestion task for document %s", persisted.id)
            except Exception as enqueue_err:
                logger.warning("Failed to enqueue ingestion task: %s", enqueue_err)

        return persisted


class ListDocumentsService:
    """Fetches a paginated list of documents for a tenant."""

    def __init__(self, repository: DocumentRepository):
        self.repository = repository

    def execute(
        self, tenant_id: uuid.UUID, limit: int = 50, offset: int = 0
    ) -> tuple[list[Document], int]:
        documents = self.repository.list(tenant_id=tenant_id, limit=limit, offset=offset)
        total = self.repository.count(tenant_id=tenant_id)
        return list(documents), total


class GetDocumentService:
    """Fetches a specific document for a tenant."""

    def __init__(self, repository: DocumentRepository):
        self.repository = repository

    def execute(self, tenant_id: uuid.UUID, document_id: uuid.UUID) -> Document:
        document = self.repository.get_by_id(document_id, tenant_id=tenant_id)
        if not document:
            raise NotFoundException(
                message="Document not found.",
                code=404,
                data={"document_id": str(document_id)},
            )
        return document


class GetDocumentStatusService:
    """Fetches only the status of a specific document for a tenant."""

    def __init__(self, repository: DocumentRepository):
        self.repository = repository

    async def execute(self, tenant_id: uuid.UUID, document_id: uuid.UUID) -> Document:
        from src.core.cache import get_cache, set_cache
        from src.ingestion.domain.entities import DocumentStatus, SourceType
        import datetime

        cache_key = f"doc_status:{document_id}"
        try:
            cached = await get_cache(cache_key)
            if cached and cached.get("tenant_id") == str(tenant_id):
                doc = Document(
                    id=uuid.UUID(cached["id"]),
                    tenant_id=uuid.UUID(cached["tenant_id"]),
                    source_type=cached["source_type"],
                    title=cached["title"],
                    mime_type=cached["mime_type"],
                    created_by=uuid.UUID(cached["created_by"]),
                    storage_uri=cached.get("storage_uri"),
                    status=cached["status"],
                    version=cached.get("version", 1),
                    created_at=datetime.datetime.fromisoformat(cached["created_at"]),
                    retry_count=cached.get("retry_count", 0),
                    last_error=cached.get("last_error"),
                )
                return doc
        except Exception as e:
            logger.error(f"Cache read error for {document_id}: {e}")

        document = self.repository.get_by_id(document_id, tenant_id=tenant_id)
        if not document:
            raise NotFoundException(
                message="Document not found.",
                code=404,
                data={"document_id": str(document_id)},
            )
            
        try:
            import dataclasses
            doc_dict = dataclasses.asdict(document)
            doc_dict["id"] = str(document.id)
            doc_dict["tenant_id"] = str(document.tenant_id)
            doc_dict["created_by"] = str(document.created_by)
            if document.source_type:
                doc_dict["source_type"] = (
                    document.source_type.value if hasattr(document.source_type, "value") else str(document.source_type)
                )
            if document.status:
                doc_dict["status"] = (
                    document.status.value if hasattr(document.status, "value") else str(document.status)
                )
            doc_dict["created_at"] = document.created_at.isoformat()
            
            await set_cache(cache_key, doc_dict, ttl_seconds=60)
        except Exception as e:
            logger.error(f"Cache write error for {document_id}: {e}")

        return document


class DeleteDocumentService:
    """
    Deletes a document using the metadata-first consistency strategy.

    The database record is removed first. Only after a successful DB flush
    do we attempt to remove the object from storage — this ensures the
    authoritative access-control boundary (the DB) is always clean even
    when the storage cleanup fails.
    """

    def __init__(self, repository: DocumentRepository, storage: ObjectStorage):
        self.repository = repository
        self.storage = storage

    def execute(self, tenant_id: uuid.UUID, document_id: uuid.UUID) -> None:
        document = self.repository.get_by_id(document_id, tenant_id=tenant_id)
        if not document:
            raise NotFoundException(
                message="Document not found.",
                code=404,
                data={"document_id": str(document_id)},
            )

        storage_uri = document.storage_uri

        # 1. Delete DB record first — this is the authoritative boundary
        self.repository.delete(document_id, tenant_id=tenant_id)

        # 2. Best-effort S3 cleanup (orphaned objects are acceptable;
        #    missing DB rows are not)
        if storage_uri:
            try:
                self.storage.delete(storage_uri)
            except Exception as exc:
                logger.error(
                    "Failed to clean up storage object %s for deleted document %s: %s",
                    storage_uri,
                    document_id,
                    exc,
                )
