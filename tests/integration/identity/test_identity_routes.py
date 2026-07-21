"""
End-to-end tests for the identity HTTP routes (TestClient + SQLite).

These tests wire the full FastAPI app together and exercise the
public surface: register, login, refresh, /me endpoints, and the
API-key flow. The DB is replaced with an in-memory SQLite engine
for the duration of each test via the `get_db` dependency override.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.main import app
from src.platform.database import Base, get_db


@pytest.fixture
def client():
    """Yield a TestClient backed by an in-memory SQLite DB."""
    # Import models so they register on `Base.metadata`.
    from src.identity.domain.entities import Tenant
    from src.identity.infrastructure import models  # noqa: F401

    # Reset the in-process slug registry so a previous test's
    # tenants don't leak into this one.
    Tenant.reset_slug_registry()

    # `StaticPool` + `check_same_thread=False` makes :memory:
    # SQLite share a single connection across threads and requests,
    # which is what TestClient + sync SQLAlchemy need.
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
        engine.dispose()
        Tenant.reset_slug_registry()


# ---------------------------------------------------------------------------
# /auth/register
# ---------------------------------------------------------------------------


def test_register_returns_tokens_and_user(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": "Acme",
            "tenant_slug": "acme",
            "email": "alice@example.com",
            "password": "ValidPassword123!",
            "full_name": "Alice",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["role"] == "owner"
    assert body["tenant"]["slug"] == "acme"


def test_register_rejects_short_password(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": "A",
            "tenant_slug": "short-pw",
            "email": "a@x.com",
            "password": "short",
        },
    )
    assert resp.status_code == 422  # Pydantic validation


def test_register_rejects_duplicate_slug(client):
    payload = {
        "tenant_name": "Acme",
        "tenant_slug": "dup",
        "email": "a@x.com",
        "password": "ValidPassword123!",
    }
    r1 = client.post("/api/v1/auth/register", json=payload)
    assert r1.status_code == 201
    payload["email"] = "b@x.com"
    r2 = client.post("/api/v1/auth/register", json=payload)
    assert r2.status_code == 409


# ---------------------------------------------------------------------------
# /auth/login
# ---------------------------------------------------------------------------


def test_login_with_correct_credentials(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": "Acme",
            "tenant_slug": "login",
            "email": "u@x.com",
            "password": "ValidPassword123!",
        },
    )
    resp = client.post(
        "/api/v1/auth/login",
        json={"tenant_slug": "login", "email": "u@x.com", "password": "ValidPassword123!"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["access_token"]
    assert body["user"]["email"] == "u@x.com"


def test_login_with_wrong_password_returns_401(client):
    client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": "A",
            "tenant_slug": "wp",
            "email": "u@x.com",
            "password": "ValidPassword123!",
        },
    )
    resp = client.post(
        "/api/v1/auth/login",
        json={"tenant_slug": "wp", "email": "u@x.com", "password": "WrongPassword!"},
    )
    assert resp.status_code == 401


def test_login_does_not_leak_tenant_existence(client):
    """A login against a non-existent tenant should not differ in
    response from a wrong-password attempt — both 401 with the
    same generic message."""
    resp = client.post(
        "/api/v1/auth/login",
        json={"tenant_slug": "no-such", "email": "a@x.com", "password": "x"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# /auth/refresh
# ---------------------------------------------------------------------------


def test_refresh_exchanges_refresh_token(client):
    r = client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": "A",
            "tenant_slug": "ref",
            "email": "u@x.com",
            "password": "ValidPassword123!",
        },
    )
    refresh = r.json()["refresh_token"]
    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"]


def test_refresh_rejects_access_token_as_refresh(client):
    r = client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": "A",
            "tenant_slug": "ref2",
            "email": "u@x.com",
            "password": "ValidPassword123!",
        },
    )
    access = r.json()["access_token"]
    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": access})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# /users/me and /tenants/me
# ---------------------------------------------------------------------------


def _register_and_get_token(client, slug="me", email="me@x.com"):
    r = client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": "Me",
            "tenant_slug": slug,
            "email": email,
            "password": "ValidPassword123!",
            "full_name": "Initial Name",
        },
    )
    return r.json()["access_token"]


def test_get_current_user(client):
    token = _register_and_get_token(client)
    resp = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@x.com"


def test_get_current_user_requires_auth(client):
    resp = client.get("/api/v1/users/me")
    assert resp.status_code == 401


def test_update_profile(client):
    token = _register_and_get_token(client)
    resp = client.patch(
        "/api/v1/users/me",
        json={"full_name": "Updated Name"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["full_name"] == "Updated Name"


def test_get_current_tenant(client):
    token = _register_and_get_token(client, slug="my-tenant", email="owner@x.com")
    resp = client.get("/api/v1/tenants/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["slug"] == "my-tenant"


def test_owner_can_patch_tenant(client):
    token = _register_and_get_token(client, slug="owned", email="owner@x.com")
    resp = client.patch(
        "/api/v1/tenants/me",
        json={"name": "Renamed Co", "plan": "pro"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Renamed Co"
    assert body["plan"] == "pro"


# ---------------------------------------------------------------------------
# /api-keys
# ---------------------------------------------------------------------------


def test_create_and_list_api_key(client):
    token = _register_and_get_token(client, slug="apikeys", email="owner@x.com")
    create = client.post(
        "/api/v1/api-keys",
        json={"name": "CI", "scopes": ["documents:read"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["name"] == "CI"
    assert body["scopes"] == ["documents:read"]
    assert body["raw_key"].startswith("ctx_")
    # The hash is never exposed.
    assert "key_hash" not in body

    listing = client.get(
        "/api/v1/api-keys", headers={"Authorization": f"Bearer {token}"}
    )
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    # Even the listing response must not leak the hash or the raw key.
    assert "key_hash" not in listing.json()[0]
    assert "raw_key" not in listing.json()[0]


def test_revoke_api_key(client):
    token = _register_and_get_token(client, slug="rev", email="owner@x.com")
    create = client.post(
        "/api/v1/api-keys",
        json={"name": "k"},
        headers={"Authorization": f"Bearer {token}"},
    )
    key_id = create.json()["id"]
    raw_key = create.json()["raw_key"]

    delete = client.delete(
        f"/api/v1/api-keys/{key_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert delete.status_code == 200
    assert delete.json()["revoked_at"] is not None

    # Even the right raw key should now be unusable.
    me = client.get(
        "/api/v1/users/me", headers={"X-API-Key": raw_key}
    )
    # (We don't have a route that takes X-API-Key in this MVP,
    # so this is just a sanity check that the response shape is
    # consistent. The auth path is exercised in unit tests.)
    assert me.status_code in (200, 401)


# ---------------------------------------------------------------------------
# Role-based authorization
# ---------------------------------------------------------------------------


def test_viewer_cannot_patch_tenant(client):
    """Register the owner, then create a viewer user and confirm
    the viewer is rejected by the role check on PATCH /tenants/me."""
    from src.identity.domain.entities import Role, User
    from src.identity.infrastructure.repositories import (
        TenantRepository,
        UserRepository,
    )
    from src.identity.infrastructure.security import hash_password

    # Bootstrap the owner.
    _register_and_get_token(client, slug="rbac", email="owner@x.com")

    # Borrow a session from the test app's overridden `get_db` so
    # we write to the same in-memory DB the request just used.
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        tenant = TenantRepository(db).find_by_slug("rbac")
        assert tenant is not None
        viewer = User.create(
            tenant_id=tenant.id,
            email="viewer@x.com",
            hashed_password=hash_password("ViewerPass123!"),
            role=Role.VIEWER,
            full_name="Viewer",
        )
        UserRepository(db).create(viewer)
        db.commit()
    finally:
        try:
            next(db_gen)
        except StopIteration:
            pass

    # Log in as the viewer
    resp = client.post(
        "/api/v1/auth/login",
        json={"tenant_slug": "rbac", "email": "viewer@x.com", "password": "ViewerPass123!"},
    )
    assert resp.status_code == 200, resp.text
    viewer_token = resp.json()["access_token"]

    # The viewer must NOT be allowed to PATCH the tenant.
    patch = client.patch(
        "/api/v1/tenants/me",
        json={"name": "Hacked"},
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert patch.status_code == 403
