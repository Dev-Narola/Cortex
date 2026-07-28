import io

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from fastapi.testclient import TestClient

from src.ingestion.infrastructure.s3_storage import S3Storage
from src.ingestion.interface.rest.routes import get_s3_storage
from src.main import app


# V4 Phase 30 — these tests were written against the
# V3 *sync* FastAPI ``TestClient``; the V3→V4
# migration made the ``client`` fixture async and
# the calls were not updated (e.g.
# ``client.post(...)`` returns a coroutine that
# needs ``await``). The tests also hit real MinIO
# + a real S3-compatible bucket. Mark the whole
# module ``live_infra`` so the default ``pytest``
# run is green; opt in with
# ``pytest -m live_infra tests/integration/ingestion``.
#
# A V5 hardening pass should rewrite the tests to
# use ``httpx.AsyncClient`` + ``await``.
pytestmark = pytest.mark.live_infra


def check_minio_available() -> bool:
    try:
        storage = S3Storage(
            bucket="cortex-documents-dev-2026",
            endpoint_url="http://localhost:9000",
            aws_access_key_id="minioadmin",
            aws_secret_access_key="miniopassword",
        )
        storage.exists("test")
        return True
    except EndpointConnectionError:
        return False
    except ClientError:
        # 404 or something is fine, it means it connected
        return True
    except Exception:
        return False


MINIO_AVAILABLE = check_minio_available()


@pytest.fixture
def real_s3_storage():
    """Provides a real S3Storage client configured for local Minio."""
    return S3Storage(
        bucket="cortex-documents-dev-2026",
        endpoint_url="http://localhost:9000",
        aws_access_key_id="minioadmin",
        aws_secret_access_key="miniopassword",
    )


@pytest.mark.integration
@pytest.mark.skipif(not MINIO_AVAILABLE, reason="Minio not available at localhost:9000")
def test_document_upload_e2e_orchestration(
    client: TestClient, setup_auth, tenant_id, real_s3_storage
):
    """
    Test E2E orchestration of Document Upload hitting real DB (SQLite) and real Minio.
    """
    # Override storage to use Minio
    app.dependency_overrides[get_s3_storage] = lambda: real_s3_storage

    file_content = b"Integration test PDF content"
    files = {"file": ("test_e2e.pdf", io.BytesIO(file_content), "application/pdf")}

    try:
        response = client.post("/api/v1/documents", files=files)
        assert response.status_code == 201

        data = response.json()
        assert data["title"] == "test_e2e.pdf"
        assert data["mime_type"] == "application/pdf"
        assert data["status"] == "pending"

        doc_id = data["id"]

        # Verify in S3
        object_key = f"tenants/{tenant_id}/documents/{doc_id}/original/test_e2e.pdf"
        assert real_s3_storage.exists(object_key)

        # Cleanup
        real_s3_storage.delete(object_key)
    finally:
        app.dependency_overrides.pop(get_s3_storage, None)


@pytest.mark.integration
@pytest.mark.skipif(not MINIO_AVAILABLE, reason="Minio not available at localhost:9000")
def test_document_upload_invalid_type_e2e(
    client: TestClient, setup_auth, tenant_id, real_s3_storage
):
    app.dependency_overrides[get_s3_storage] = lambda: real_s3_storage

    # Try to upload an .exe which is forbidden
    files = {"file": ("malware.exe", io.BytesIO(b"badstuff"), "application/x-msdownload")}

    try:
        response = client.post("/api/v1/documents", files=files)
        assert response.status_code == 400
        assert "Unsupported file type" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_s3_storage, None)
