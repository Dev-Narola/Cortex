import uuid
import pytest
from unittest.mock import Mock, patch, AsyncMock
from io import BytesIO

from src.ingestion.application.services import CreateDocumentService
from src.ingestion.domain.entities import Document, DocumentStatus


@pytest.fixture
def repository():
    return Mock()

@pytest.fixture
def storage():
    return Mock()

@pytest.fixture
def queue():
    q = Mock()
    q.enqueue = AsyncMock()
    return q

@pytest.mark.asyncio
async def test_create_document_success(repository, storage, queue):
    tenant_id = uuid.uuid4()
    created_by = uuid.uuid4()
    doc_id = uuid.uuid4()
    
    mock_doc = Document.create(
        tenant_id=tenant_id,
        source_type="upload",
        title="test.txt",
        mime_type="text/plain",
        created_by=created_by,
    )
    mock_doc.id = doc_id
    repository.create.return_value = mock_doc
    storage.upload.return_value = "s3://bucket/test.txt"
    
    service = CreateDocumentService(repository=repository, storage=storage, queue=queue)
    
    file_obj = BytesIO(b"hello world")
    
    result = await service.execute(
        tenant_id=tenant_id,
        created_by=created_by,
        filename="test.txt",
        mime_type="text/plain",
        file_obj=file_obj,
    )
    
    assert result.id == doc_id
    assert result.storage_uri == "s3://bucket/test.txt"
    
    repository.create.assert_called_once()
    storage.upload.assert_called_once()
    repository.update_storage_uri.assert_called_once_with(
        doc_id, tenant_id=tenant_id, storage_uri="s3://bucket/test.txt"
    )
    
    queue.enqueue.assert_called_once_with(
        "ingest_document_task",
        document_id=str(doc_id),
        tenant_id=str(tenant_id),
    )


@pytest.mark.asyncio
async def test_create_document_upload_failure(repository, storage, queue):
    tenant_id = uuid.uuid4()
    created_by = uuid.uuid4()
    doc_id = uuid.uuid4()
    
    mock_doc = Document.create(
        tenant_id=tenant_id,
        source_type="upload",
        title="test.txt",
        mime_type="text/plain",
        created_by=created_by,
    )
    mock_doc.id = doc_id
    repository.create.return_value = mock_doc
    
    # Upload fails
    storage.upload.side_effect = Exception("S3 error")
    
    service = CreateDocumentService(repository=repository, storage=storage, queue=queue)
    
    file_obj = BytesIO(b"hello world")
    
    with pytest.raises(Exception, match="S3 error"):
        await service.execute(
            tenant_id=tenant_id,
            created_by=tenant_id,
            filename="test.txt",
            mime_type="text/plain",
            file_obj=file_obj,
        )
    
    # Document created
    repository.create.assert_called_once()
    storage.upload.assert_called_once()
    
    # Document marked as failed
    repository.update_status.assert_called_once_with(
        doc_id, tenant_id=tenant_id, status=DocumentStatus.FAILED
    )
    
    # URI not updated
    repository.update_storage_uri.assert_not_called()
    # Queue not called
    queue.enqueue.assert_not_called()
