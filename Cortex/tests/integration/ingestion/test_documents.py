import uuid

import pytest

from src.ingestion.domain.entities import Document, DocumentStatus
from src.ingestion.infrastructure.repositories import DocumentRepository
from src.ingestion.infrastructure.storage import LocalStorage
from src.ingestion.interface.rest.routes import get_s3_storage
from src.main import app


@pytest.fixture
def local_storage():
    return LocalStorage()


@pytest.fixture
def override_storage(local_storage):
    app.dependency_overrides[get_s3_storage] = lambda: local_storage
    yield
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
async def test_list_documents(client, setup_auth, db_session, tenant_id, override_storage):
    repo = DocumentRepository(db_session)
    repo.create(_make_doc(tenant_id, "doc1.pdf"))
    repo.create(_make_doc(tenant_id, "doc2.pdf"))
    db_session.commit()

    response = await client.get("/api/v1/documents")
    assert response.status_code == 200

    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    titles = {item["title"] for item in data["items"]}
    assert titles == {"doc1.pdf", "doc2.pdf"}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_list_documents_status_filter(client, setup_auth, db_session, tenant_id, override_storage):
    repo = DocumentRepository(db_session)
    ok = repo.create(_make_doc(tenant_id, "ok.pdf"))
    bad = repo.create(_make_doc(tenant_id, "bad.pdf"))
    repo.create(_make_doc(tenant_id, "queued.pdf"))
    repo.update_status(ok.id, tenant_id=tenant_id, status=DocumentStatus.INDEXED)
    repo.update_status(bad.id, tenant_id=tenant_id, status=DocumentStatus.FAILED)
    db_session.commit()

    failed = (await client.get("/api/v1/documents?status=failed&limit=1")).json()
    assert failed["total"] == 1
    assert [d["title"] for d in failed["items"]] == ["bad.pdf"]
    assert (await client.get("/api/v1/documents?status=indexed")).json()["total"] == 1
    assert (await client.get("/api/v1/documents")).json()["total"] == 3
    assert (await client.get("/api/v1/documents?status=bogus")).status_code == 422
    assert (await client.get("/api/v1/documents?limit=500")).status_code == 422


@pytest.mark.integration
@pytest.mark.asyncio
async def test_get_document(client, setup_auth, db_session, tenant_id, override_storage):
    repo = DocumentRepository(db_session)
    doc = repo.create(_make_doc(tenant_id, "getme.pdf"))
    db_session.commit()

    response = await client.get(f"/api/v1/documents/{doc.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(doc.id)
    assert data["title"] == "getme.pdf"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_get_document_status(
    client, setup_auth, db_session, tenant_id, override_storage
):
    repo = DocumentRepository(db_session)
    doc = repo.create(_make_doc(tenant_id, "status.pdf"))
    db_session.commit()

    response = await client.get(f"/api/v1/documents/{doc.id}/status")
    assert response.status_code == 200
    data = response.json()
    assert data["document_id"] == str(doc.id)
    assert data["status"] == DocumentStatus.PENDING.value


@pytest.mark.integration
@pytest.mark.asyncio
async def test_get_document_not_found(client, setup_auth, tenant_id, override_storage):
    response = await client.get(f"/api/v1/documents/{uuid.uuid4()}")
    assert response.status_code == 404
