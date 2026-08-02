import io
import uuid

import pytest
from fastapi import HTTPException

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


def _deny_write():
    raise HTTPException(status_code=403, detail="Missing required scope: documents:write")


def _deny_read():
    raise HTTPException(status_code=403, detail="Missing required scope: documents:read")


def _allow_read():
    return uuid.uuid4()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_key_without_write_scope_cannot_upload(client, override_storage):
    app.dependency_overrides[require_document_write] = _deny_write
    app.dependency_overrides[require_document_read] = _allow_read
    try:
        files = {"file": ("test.pdf", io.BytesIO(b"content"), "application/pdf")}
        res = await client.post("/api/v1/documents", files=files)
        assert res.status_code == 403
        assert "Missing required scope" in res.json()["detail"]
    finally:
        app.dependency_overrides.pop(require_document_write, None)
        app.dependency_overrides.pop(require_document_read, None)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_key_without_write_scope_cannot_delete(client, override_storage):
    app.dependency_overrides[require_document_write] = _deny_write
    try:
        res = await client.delete(f"/api/v1/documents/{uuid.uuid4()}")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.pop(require_document_write, None)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_key_without_read_scope_cannot_list(client):
    app.dependency_overrides[require_document_read] = _deny_read
    try:
        res = await client.get("/api/v1/documents")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.pop(require_document_read, None)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_key_without_read_scope_cannot_get(client):
    app.dependency_overrides[require_document_read] = _deny_read
    try:
        res = await client.get(f"/api/v1/documents/{uuid.uuid4()}")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.pop(require_document_read, None)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_key_without_read_scope_cannot_get_status(client):
    app.dependency_overrides[require_document_read] = _deny_read
    try:
        res = await client.get(f"/api/v1/documents/{uuid.uuid4()}/status")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.pop(require_document_read, None)
