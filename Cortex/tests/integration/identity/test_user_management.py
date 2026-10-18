"""Invites, roles, and RBAC end to end (FR-ID-02 / US-1)."""

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

PASSWORD = "ValidPassword123!"


@pytest.fixture
def api(client):  # noqa: F811 - pytest fixture injection
    storage = LocalStorage()
    app.dependency_overrides[get_s3_storage] = lambda: storage
    app.dependency_overrides[get_create_document_service] = (
        lambda repo=Depends(get_document_repository): CreateDocumentService(repo, storage)
    )
    return client


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _invite(c, token, email, role):
    return c.post("/api/v1/users/invite", json={"email": email, "role": role}, headers=_h(token))


def _join(c, owner_token, email, role) -> tuple[str, str]:
    r = _invite(c, owner_token, email, role)
    assert r.status_code == 201, r.text
    r = c.post("/api/v1/auth/accept-invite", json={"token": r.json()["invite_token"], "password": PASSWORD})
    assert r.status_code == 201, r.text
    return r.json()["access_token"], r.json()["user"]["id"]


def test_invite_accept_and_role(api):
    owner = _register_and_get_token(api)
    member, _ = _join(api, owner, "m@x.com", "member")
    me = api.get("/api/v1/users/me", headers=_h(member)).json()
    assert me["role"] == "member" and me["email"] == "m@x.com"
    emails = [u["email"] for u in api.get("/api/v1/users", headers=_h(owner)).json()]
    assert "m@x.com" in emails


def test_only_owner_admin_invite_and_only_owner_grants_admin(api):
    owner = _register_and_get_token(api)
    admin, _ = _join(api, owner, "a@x.com", "admin")
    member, _ = _join(api, owner, "m@x.com", "member")
    assert _invite(api, member, "z@x.com", "viewer").status_code == 403
    assert _invite(api, admin, "z@x.com", "admin").status_code == 403
    assert _invite(api, admin, "z@x.com", "viewer").status_code == 201


def test_viewer_can_read_but_not_upload_or_delete(api):
    owner = _register_and_get_token(api)
    viewer, _ = _join(api, owner, "v@x.com", "viewer")
    doc = api.post(
        "/api/v1/documents",
        files={"file": ("a.txt", b"hello", "text/plain")},
        headers=_h(owner),
    ).json()["id"]
    assert api.get(f"/api/v1/documents/{doc}", headers=_h(viewer)).status_code == 200
    assert api.delete(f"/api/v1/documents/{doc}", headers=_h(viewer)).status_code == 403
    upload = api.post(
        "/api/v1/documents", files={"file": ("b.txt", b"x", "text/plain")}, headers=_h(viewer)
    )
    assert upload.status_code == 403


def test_last_owner_cannot_be_demoted(api):
    owner = _register_and_get_token(api)
    owner_id = api.get("/api/v1/users/me", headers=_h(owner)).json()["id"]
    r = api.patch(f"/api/v1/users/{owner_id}", json={"role": "admin"}, headers=_h(owner))
    assert r.status_code == 409
    _, other_id = _join(api, owner, "o2@x.com", "member")
    assert api.patch(f"/api/v1/users/{other_id}", json={"role": "owner"}, headers=_h(owner)).status_code == 200
    assert api.patch(f"/api/v1/users/{owner_id}", json={"role": "admin"}, headers=_h(owner)).status_code == 200


def test_deactivated_user_is_locked_out(api):
    owner = _register_and_get_token(api)
    member, member_id = _join(api, owner, "m@x.com", "member")
    assert api.patch(f"/api/v1/users/{member_id}", json={"is_active": False}, headers=_h(owner)).status_code == 200
    assert api.get("/api/v1/users/me", headers=_h(member)).status_code == 401


def test_invite_token_is_single_use_and_not_an_access_token(api):
    owner = _register_and_get_token(api)
    token = _invite(api, owner, "m@x.com", "member").json()["invite_token"]
    assert api.get("/api/v1/users/me", headers=_h(token)).status_code == 401
    body = {"token": token, "password": PASSWORD}
    assert api.post("/api/v1/auth/accept-invite", json=body).status_code == 201
    assert api.post("/api/v1/auth/accept-invite", json=body).status_code == 409


def test_cannot_manage_another_tenants_users(api):
    a_owner = _register_and_get_token(api, slug="acme", email="a@a.com")
    _, a_member = _join(api, a_owner, "m@a.com", "member")
    b_owner = _register_and_get_token(api, slug="beta", email="b@b.com")
    assert api.patch(f"/api/v1/users/{a_member}", json={"role": "viewer"}, headers=_h(b_owner)).status_code == 404
    assert "m@a.com" not in str(api.get("/api/v1/users", headers=_h(b_owner)).json())
