r"""
End-to-end smoke test for the identity module.

Drives the full FastAPI app via TestClient against an in-memory
SQLite DB, exercising the public surface end to end:

  1. Register a new tenant with an owner
  2. Login with the same credentials
  3. GET /users/me with the access token
  4. PATCH /users/me to set full_name
  5. PATCH /tenants/me to rename the tenant
  6. POST /api-keys to generate a key
  7. GET /api-keys to list keys
  8. DELETE /api-keys/{id} to revoke the key
  9. POST /auth/refresh to exchange a refresh token
 10. Verify error responses for invalid credentials, missing auth,
     unauthorized role actions, etc.

Run with:
    .venv\Scripts\python.exe scripts\smoke_test_identity.py
"""  # noqa: E501

from __future__ import annotations

import json
import sys
from pathlib import Path

# Make `src` importable when running this script directly.
# Put the PARENT of `src/` on sys.path so that `src.xxx` imports
# work, but `import platform` still resolves to the stdlib module
# (otherwise the project's `src.core` package shadows it and
# SQLAlchemy's import breaks).
_REPO_ROOT = Path(__file__).resolve().parent.parent
_SRC_PARENT = _REPO_ROOT  # the directory that contains `src/`
if str(_SRC_PARENT) not in sys.path:
    sys.path.insert(0, str(_SRC_PARENT))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.main import app
from src.core.database import Base, get_db


def _print(label: str, value: object) -> None:
    print(f"  {label}: {value}")


def _check(label: str, actual: object, expected: object) -> None:
    if actual == expected:
        print(f"  PASS  {label}")
    else:
        print(f"  FAIL  {label}")
        print(f"        expected: {expected!r}")
        print(f"        actual:   {actual!r}")
        sys.exit(1)


def main() -> int:
    # Wire the in-memory SQLite engine through the dependency override.
    from src.identity.infrastructure import models  # noqa: F401
    from src.identity.domain.entities import Tenant

    Tenant.reset_slug_registry()
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
            print("\n[1] POST /auth/register")
            r = c.post(
                "/api/v1/auth/register",
                json={
                    "tenant_name": "Acme Corp",
                    "tenant_slug": "acme",
                    "email": "alice@acme.com",
                    "password": "ValidPassword123!",
                    "full_name": "Alice Founder",
                },
            )
            _check("status", r.status_code, 201)
            body = r.json()
            _check("tenant.slug", body["tenant"]["slug"], "acme")
            _check("user.role", body["user"]["role"], "owner")
            _check("token_type", body["token_type"], "bearer")
            access = body["access_token"]
            refresh = body["refresh_token"]
            _print("user.id", body["user"]["id"])

            print("\n[2] POST /auth/login (with same creds)")
            r = c.post(
                "/api/v1/auth/login",
                json={
                    "tenant_slug": "acme",
                    "email": "alice@acme.com",
                    "password": "ValidPassword123!",
                },
            )
            _check("status", r.status_code, 200)
            access = r.json()["access_token"]
            refresh = r.json()["refresh_token"]

            print("\n[3] GET /users/me (Bearer access)")
            r = c.get(
                "/api/v1/users/me", headers={"Authorization": f"Bearer {access}"}
            )
            _check("status", r.status_code, 200)
            _check("email", r.json()["email"], "alice@acme.com")
            _check("role", r.json()["role"], "owner")
            _check("is_active", r.json()["is_active"], True)

            print("\n[4] PATCH /users/me (set full_name)")
            r = c.patch(
                "/api/v1/users/me",
                json={"full_name": "Alice O. Founder"},
                headers={"Authorization": f"Bearer {access}"},
            )
            _check("status", r.status_code, 200)
            _check("full_name", r.json()["full_name"], "Alice O. Founder")

            print("\n[5] PATCH /tenants/me (rename + plan=pro)")
            r = c.patch(
                "/api/v1/tenants/me",
                json={"name": "Acme Knowledge Base", "plan": "pro"},
                headers={"Authorization": f"Bearer {access}"},
            )
            _check("status", r.status_code, 200)
            _check("name", r.json()["name"], "Acme Knowledge Base")
            _check("plan", r.json()["plan"], "pro")

            print("\n[6] POST /api-keys")
            r = c.post(
                "/api/v1/api-keys",
                json={"name": "CI pipeline", "scopes": ["documents:read", "search:read"]},
                headers={"Authorization": f"Bearer {access}"},
            )
            _check("status", r.status_code, 201)
            key = r.json()
            _check("name", key["name"], "CI pipeline")
            _check("scopes", key["scopes"], ["documents:read", "search:read"])
            _print("raw_key (shown ONCE)", key["raw_key"])
            assert "key_hash" not in key, "raw key_hash must never be exposed"
            raw = key["raw_key"]
            key_id = key["id"]

            print("\n[7] GET /api-keys (list)")
            r = c.get(
                "/api/v1/api-keys", headers={"Authorization": f"Bearer {access}"}
            )
            _check("status", r.status_code, 200)
            listing = r.json()
            _check("count", len(listing), 1)
            _check("no raw_key", "raw_key" not in listing[0], True)
            _check("no key_hash", "key_hash" not in listing[0], True)

            print("\n[8] DELETE /api-keys/{id} (revoke)")
            r = c.delete(
                f"/api/v1/api-keys/{key_id}",
                headers={"Authorization": f"Bearer {access}"},
            )
            _check("status", r.status_code, 200)
            _check("revoked_at is set", r.json()["revoked_at"] is not None, True)

            print("\n[9] POST /auth/refresh")
            r = c.post(
                "/api/v1/auth/refresh", json={"refresh_token": refresh}
            )
            _check("status", r.status_code, 200)
            _check("has access_token", bool(r.json()["access_token"]), True)

            print("\n[10] Error responses")
            r = c.get("/api/v1/users/me")
            _check("missing auth -> 401", r.status_code, 401)

            r = c.post(
                "/api/v1/auth/login",
                json={
                    "tenant_slug": "acme",
                    "email": "alice@acme.com",
                    "password": "WrongPassword!",
                },
            )
            _check("bad password -> 401", r.status_code, 401)

            r = c.post(
                "/api/v1/auth/register",
                json={
                    "tenant_name": "Other",
                    "tenant_slug": "acme",
                    "email": "other@x.com",
                    "password": "ValidPassword123!",
                },
            )
            _check("duplicate slug -> 409", r.status_code, 409)

            r = c.post(
                "/api/v1/auth/register",
                json={
                    "tenant_name": "X",
                    "tenant_slug": "ok",
                    "email": "x@x.com",
                    "password": "short",
                },
            )
            _check("short password -> 422", r.status_code, 422)

            print("\nAll checks passed.")
            return 0
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
        engine.dispose()
        Tenant.reset_slug_registry()


if __name__ == "__main__":
    sys.exit(main())
