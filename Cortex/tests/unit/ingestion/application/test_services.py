import io
import uuid
from unittest.mock import MagicMock

import pytest

from src.ingestion.application.services import (
    CreateDocumentService,
    DeleteDocumentService,
    ListDocumentsService,
)
from src.ingestion.domain.entities import Document, DocumentStatus
from src.shared.exceptions import NotFoundException


@pytest.fixture
def mock_repo():
    repo = MagicMock()
    # create() should return the same document it receives so callers can
    # inspect/mutate the entity that was persisted.
    repo.create.side_effect = lambda doc: doc
    return repo


@pytest.fixture
def mock_storage():
    return MagicMock()


@pytest.fixture
def tenant_id():
    return uuid.uuid4()


# ---------------------------------------------------------------------------
# CreateDocumentService
# ---------------------------------------------------------------------------


def test_create_document_service_success(mock_repo, mock_storage, tenant_id):
    service = CreateDocumentService(mock_repo, mock_storage)
    mock_storage.upload.return_value = "s3://bucket/tenants/x/documents/y/original/test.pdf"

    file_obj = io.BytesIO(b"test content")
    doc = service.execute(
        tenant_id=tenant_id,
        created_by=tenant_id,
        filename="test.pdf",
        mime_type="application/pdf",
        file_obj=file_obj,
    )

    assert doc.tenant_id == tenant_id
    assert doc.title == "test.pdf"
    # storage_uri is set in-memory after a successful upload
    assert doc.storage_uri == "s3://bucket/tenants/x/documents/y/original/test.pdf"

    mock_repo.create.assert_called_once()
    mock_storage.upload.assert_called_once()
    mock_repo.update_storage_uri.assert_called_once()


def test_create_document_service_upload_fails(mock_repo, mock_storage, tenant_id):
    service = CreateDocumentService(mock_repo, mock_storage)
    mock_storage.upload.side_effect = Exception("S3 error")

    file_obj = io.BytesIO(b"test content")

    with pytest.raises(Exception, match="S3 error"):
        service.execute(
            tenant_id=tenant_id,
            created_by=tenant_id,
            filename="test.pdf",
            mime_type="application/pdf",
            file_obj=file_obj,
        )

    # Repository must have been asked to mark the document as FAILED
    mock_repo.update_status.assert_called_once()
    call_kwargs = mock_repo.update_status.call_args
    assert call_kwargs.kwargs["status"] == DocumentStatus.FAILED


# ---------------------------------------------------------------------------
# ListDocumentsService
# ---------------------------------------------------------------------------


def test_list_documents_service(mock_repo, tenant_id):
    service = ListDocumentsService(mock_repo)

    mock_repo.list.return_value = ["doc1", "doc2"]
    mock_repo.count.return_value = 2

    docs, total = service.execute(tenant_id, limit=10, offset=0)

    assert docs == ["doc1", "doc2"]
    assert total == 2
    mock_repo.list.assert_called_once_with(tenant_id=tenant_id, limit=10, offset=0)


# ---------------------------------------------------------------------------
# DeleteDocumentService
# ---------------------------------------------------------------------------


def _make_doc(tenant_id: uuid.UUID) -> Document:
    return Document.create(
        tenant_id=tenant_id,
        source_type="upload",
        title="test.pdf",
        mime_type="application/pdf",
        created_by=tenant_id,
    )


def test_delete_document_service_success(mock_repo, mock_storage, tenant_id):
    service = DeleteDocumentService(mock_repo, mock_storage)

    doc = _make_doc(tenant_id)
    mock_repo.get_by_id.return_value = doc

    service.execute(tenant_id, doc.id)

    mock_repo.delete.assert_called_once_with(doc.id, tenant_id=tenant_id)
    # storage_uri is None on a freshly created doc, so storage.delete is not called
    mock_storage.delete.assert_not_called()


def test_delete_document_service_with_storage_uri(mock_repo, mock_storage, tenant_id):
    service = DeleteDocumentService(mock_repo, mock_storage)

    doc = _make_doc(tenant_id)
    # Simulate a doc that already has a storage URI
    uri = f"s3://my-bucket/tenants/{tenant_id}/documents/{doc.id}/original/test.pdf"
    doc.set_storage_uri(uri)
    mock_repo.get_by_id.return_value = doc

    service.execute(tenant_id, doc.id)

    mock_repo.delete.assert_called_once_with(doc.id, tenant_id=tenant_id)
    mock_storage.delete.assert_called_once_with(uri)


def test_delete_document_service_not_found(mock_repo, mock_storage, tenant_id):
    service = DeleteDocumentService(mock_repo, mock_storage)
    mock_repo.get_by_id.return_value = None

    with pytest.raises(NotFoundException):
        service.execute(tenant_id, uuid.uuid4())


def test_delete_document_service_s3_fails_does_not_raise(mock_repo, mock_storage, tenant_id):
    """A storage-layer failure on delete must not propagate — the DB is already clean."""
    service = DeleteDocumentService(mock_repo, mock_storage)

    doc = _make_doc(tenant_id)
    uri = f"s3://my-bucket/tenants/{tenant_id}/documents/{doc.id}/original/test.pdf"
    doc.set_storage_uri(uri)
    mock_repo.get_by_id.return_value = doc
    mock_storage.delete.side_effect = Exception("S3 deletion failed")

    # Must not raise
    service.execute(tenant_id, doc.id)

    mock_repo.delete.assert_called_once_with(doc.id, tenant_id=tenant_id)
