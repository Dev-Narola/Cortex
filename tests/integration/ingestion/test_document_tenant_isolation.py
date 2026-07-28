import uuid

import pytest

from src.ingestion.domain.entities import Document
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.ingestion.infrastructure.storage import LocalStorage
from src.ingestion.interface.rest.auth import require_document_read, require_document_write
from src.ingestion.interface.rest.routes import get_s3_storage
from src.main import app


@pytest.fixture
def override_storage():
    storage = LocalStorage()
    app.dependency_overrides[get_s3_storage] = lambda: storage
    yield storage
    app.dependency_overrides.pop(get_s3_storage, None)


def _make_doc(tenant_id: uuid.UUID, title: str = "doc.pdf") -> Document:
    return Document.create(
        tenant_id=tenant_id,
        source_type="upload",
        title=title,
        mime_type="application/pdf",
        created_by=tenant_id,
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tenant_cannot_list_another_tenants_documents(
    client, db_session, override_storage
):
    """Tenant A's list endpoint must never return Tenant B's documents."""
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()

    repo = DocumentRepository(db_session)
    repo.create(_make_doc(tenant_b, "tenant_b.pdf"))
    db_session.commit()

    app.dependency_overrides[require_document_read] = lambda: tenant_a
    try:
        res = await client.get("/api/v1/documents")
        assert res.status_code == 200
        assert res.json()["total"] == 0
    finally:
        app.dependency_overrides.pop(require_document_read, None)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tenant_cannot_read_another_tenants_document(
    client, db_session, override_storage
):
    """A direct GET on another tenant's document ID must return 404."""
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()

    repo = DocumentRepository(db_session)
    doc_b = repo.create(_make_doc(tenant_b, "secret.pdf"))
    db_session.commit()

    app.dependency_overrides[require_document_read] = lambda: tenant_a
    try:
        res = await client.get(f"/api/v1/documents/{doc_b.id}")
        assert res.status_code == 404
    finally:
        app.dependency_overrides.pop(require_document_read, None)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tenant_cannot_delete_another_tenants_document(
    client, db_session, override_storage
):
    """A DELETE on another tenant's document ID must return 404 and leave the
    document untouched in the database."""
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()

    repo = DocumentRepository(db_session)
    doc_b = repo.create(_make_doc(tenant_b, "protected.pdf"))
    db_session.commit()

    app.dependency_overrides[require_document_write] = lambda: tenant_a
    try:
        res = await client.delete(f"/api/v1/documents/{doc_b.id}")
        assert res.status_code == 404
    finally:
        app.dependency_overrides.pop(require_document_write, None)

    # Document must still be in the database
    assert repo.get_by_id(doc_b.id, tenant_id=tenant_b) is not None
