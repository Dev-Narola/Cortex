"""
API-key authentication end to end (audit C4, C5, delete-404 bug).

Real routes + real auth dependencies over in-memory SQLite; only object
storage and the job queue are replaced so nothing leaves the process.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import Depends

from src.core.database import get_db
from src.ingestion.infrastructure.models import DocumentModel

from src.identity.infrastructure.repositories import ApiKeyRepository
from src.ingestion.application.services import CreateDocumentService
from src.ingestion.infrastructure.storage import LocalStorage
from src.ingestion.interface.rest.routes import (
    get_create_document_service,
    get_document_repository,
    get_s3_storage,
)
from src.main import app
from tests.integration.identity.test_identity_routes import (  # noqa: F401 - fixture
    _register_and_get_token,
    client,
)


@pytest.fixture
def api(client):  # noqa: F811 - pytest fixture injection
    storage = LocalStorage()
    app.dependency_overrides[get_s3_storage] = lambda: storage

    def _create_service(repo=Depends(get_document_repository)):
        return CreateDocumentService(repo, storage, queue=None)

    app.dependency_overrides[get_create_document_service] = _create_service
    return client


def _jwt(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _issue_key(c, token: str, scopes: list[str]) -> tuple[str, str]:
    r = c.post("/api/v1/api-keys", json={"name": "ci", "scopes": scopes}, headers=_jwt(token))
    assert r.status_code == 201, r.text
    return r.json()["raw_key"], r.json()["id"]


def _upload(c, headers: dict):
    return c.post(
        "/api/v1/documents",
        files={"file": ("notes.txt", b"Cortex stores vectors in pgvector.", "text/plain")},
        headers=headers,
    )


def test_api_key_upload_succeeds_and_is_attributed_to_issuer(api):
    token = _register_and_get_token(api)
    raw, _ = _issue_key(api, token, ["documents:write", "documents:read"])

    r = _upload(api, {"X-API-Key": raw})
    assert r.status_code == 202, r.text
    doc_id = r.json()["id"]

    # Bearer form works too, and the document is attributed to the issuer.
    r = api.get(f"/api/v1/documents/{doc_id}", headers=_jwt(raw))
    assert r.status_code == 200, r.text
    me = api.get("/api/v1/users/me", headers=_jwt(token)).json()["id"]
    db = next(app.dependency_overrides[get_db]())
    assert str(db.get(DocumentModel, uuid.UUID(doc_id)).created_by) == me


def test_api_key_without_scope_is_forbidden(api):
    token = _register_and_get_token(api)
    raw, _ = _issue_key(api, token, ["documents:read"])
    assert _upload(api, {"X-API-Key": raw}).status_code == 403


def test_revoked_and_unknown_keys_are_rejected(api):
    token = _register_and_get_token(api)
    raw, key_id = _issue_key(api, token, ["documents:read"])
    assert api.get("/api/v1/documents", headers={"X-API-Key": raw}).status_code == 200

    assert api.delete(f"/api/v1/api-keys/{key_id}", headers=_jwt(token)).status_code in (200, 204)
    assert api.get("/api/v1/documents", headers={"X-API-Key": raw}).status_code == 401
    assert api.get("/api/v1/documents", headers={"X-API-Key": "ctx_nope"}).status_code == 401


def test_auth_is_one_indexed_lookup_not_a_scan(api, monkeypatch):
    token = _register_and_get_token(api)
    raw, _ = _issue_key(api, token, ["documents:read"])

    def _no_scan(*_a, **_kw):
        raise AssertionError("API-key auth must not list/scan keys")

    monkeypatch.setattr(ApiKeyRepository, "list", _no_scan)
    assert api.get("/api/v1/documents", headers={"X-API-Key": raw}).status_code == 200


def test_api_key_cannot_reach_another_tenants_document(api):
    owner = _register_and_get_token(api, slug="owner", email="o@x.com")
    doc_id = _upload(api, _jwt(owner)).json()["id"]

    intruder = _register_and_get_token(api, slug="intruder", email="i@x.com")
    raw, _ = _issue_key(api, intruder, ["documents:read", "documents:write"])
    assert api.get(f"/api/v1/documents/{doc_id}", headers={"X-API-Key": raw}).status_code == 404
    assert api.delete(f"/api/v1/documents/{doc_id}", headers={"X-API-Key": raw}).status_code == 404
    # Still there for its owner.
    assert api.get(f"/api/v1/documents/{doc_id}", headers=_jwt(owner)).status_code == 200


def test_owner_can_delete_own_document(api):
    """Regression: DELETE used to compare a DocumentWriteAuth object to the
    tenant id, so it always returned 404."""
    token = _register_and_get_token(api)
    doc_id = _upload(api, _jwt(token)).json()["id"]
    assert api.delete(f"/api/v1/documents/{doc_id}", headers=_jwt(token)).status_code == 204
    assert api.get(f"/api/v1/documents/{doc_id}", headers=_jwt(token)).status_code == 404
