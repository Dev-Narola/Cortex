"""
MCP tenant isolation with API keys (US-9 AC: no tool call can return another
tenant's data, under test). Real HTTP route, real auth, in-memory SQLite.
"""

from __future__ import annotations

import pytest
from fastapi import Depends

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
    app.dependency_overrides[get_create_document_service] = (
        lambda repo=Depends(get_document_repository): CreateDocumentService(repo, storage)
    )
    return client


def _key(c, token, scopes):
    r = c.post(
        "/api/v1/api-keys",
        json={"name": "mcp", "scopes": scopes},
        headers={"Authorization": f"Bearer {token}"},
    )
    return r.json()["raw_key"]


def _call(c, key, name, arguments):
    r = c.post(
        "/api/v1/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
              "params": {"name": name, "arguments": arguments}},
        headers={"X-API-Key": key},
    )
    return r.status_code, r.json()


@pytest.fixture
def two_tenants(api):
    owner = _register_and_get_token(api, slug="alpha", email="a@x.com")
    doc = api.post(
        "/api/v1/documents",
        files={"file": ("secret.txt", b"alpha-only secret", "text/plain")},
        headers={"Authorization": f"Bearer {owner}"},
    )
    assert doc.status_code == 202, doc.text
    other = _register_and_get_token(api, slug="beta", email="b@x.com")
    return {
        "doc_id": doc.json()["id"],
        "alpha_key": _key(api, owner, ["documents:read"]),
        "beta_key": _key(api, other, ["documents:read"]),
    }


def test_get_document_is_tenant_scoped(api, two_tenants):
    status, body = _call(api, two_tenants["alpha_key"], "get_document",
                         {"document_id": two_tenants["doc_id"]})
    assert status == 200 and body["result"]["document"]["title"] == "secret.txt"

    status, body = _call(api, two_tenants["beta_key"], "get_document",
                         {"document_id": two_tenants["doc_id"]})
    assert body.get("result") is None and "error" in body
    assert "secret" not in str(body)


def test_list_documents_never_shows_other_tenants(api, two_tenants):
    _, body = _call(api, two_tenants["beta_key"], "list_documents", {})
    assert body["result"]["documents"] == []
    _, body = _call(api, two_tenants["alpha_key"], "list_documents", {})
    assert [d["id"] for d in body["result"]["documents"]] == [two_tenants["doc_id"]]


def test_mcp_rejects_keys_without_read_scope_and_unknown_keys(api):
    token = _register_and_get_token(api, slug="gamma", email="g@x.com")
    status, _ = _call(api, _key(api, token, ["documents:write"]), "list_documents", {})
    assert status == 401
    status, _ = _call(api, "ctx_unknown", "list_documents", {})
    assert status == 401


def test_read_only_key_cannot_upload(api, two_tenants):
    _, body = _call(api, two_tenants["alpha_key"], "upload_document",
                    {"title": "x", "content": "y"})
    assert "error" in body
