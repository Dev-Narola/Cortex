import uuid

import pytest
from fastapi.testclient import TestClient

from src.ingestion.domain.entities import Document
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.ingestion.infrastructure.storage import LocalStorage
from src.ingestion.interface.rest.routes import get_s3_storage
from src.main import app

# LocalStorage uses an in-memory dict. Keys can be any string, including
# full "s3://bucket/key" paths — which is exactly what the service stores
# after upload so that Document.set_storage_uri() passes domain validation.
_TEST_BUCKET = "test-bucket"


@pytest.fixture
def local_storage():
    return LocalStorage()


@pytest.fixture
def override_storage(local_storage):
    app.dependency_overrides[get_s3_storage] = lambda: local_storage
    yield local_storage
    app.dependency_overrides.pop(get_s3_storage, None)


def _make_doc(tenant_id: uuid.UUID) -> Document:
    return Document.create(
        tenant_id=tenant_id,
        source_type="upload",
        title="delete_me.pdf",
        mime_type="application/pdf",
        created_by=tenant_id,
    )


def _s3_uri(tenant_id: uuid.UUID, doc_id: uuid.UUID, title: str) -> str:
    return f"s3://{_TEST_BUCKET}/tenants/{tenant_id}/documents/{doc_id}/original/{title}"


@pytest.mark.integration
def test_document_deletion_success(
    client: TestClient, setup_auth, db_session, tenant_id, override_storage
):
    """DB record is removed first; then the storage object is cleaned up."""
    repo = DocumentRepository(db_session)
    doc = repo.create(_make_doc(tenant_id))

    # Seed the storage mock with an object at the expected s3:// path
    uri = _s3_uri(tenant_id, doc.id, doc.title)
    override_storage.upload(uri=uri, data=b"test content")
    # Point the DB record at that URI
    repo.update_storage_uri(doc.id, tenant_id=tenant_id, storage_uri=uri)
    db_session.commit()

    assert override_storage.exists(uri)

    response = client.delete(f"/api/v1/documents/{doc.id}")
    assert response.status_code == 204

    # DB record gone
    assert repo.get_by_id(doc.id, tenant_id=tenant_id) is None
    # Storage object gone
    assert not override_storage.exists(uri)


@pytest.mark.integration
def test_document_deletion_not_found(client: TestClient, setup_auth, tenant_id):
    response = client.delete(f"/api/v1/documents/{uuid.uuid4()}")
    assert response.status_code == 404
