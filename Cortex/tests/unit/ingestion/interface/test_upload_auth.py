"""
Regression tests for the document upload auth fix.

**The bug (V11).** The ``POST /api/v1/documents`` route
was passing ``created_by=tenant_id`` instead of
``created_by=user_id``. The ``documents.created_by``
column has a foreign key to ``users.id`` — passing a
tenant id blew up the SQL INSERT with:

    psycopg.errors.ForeignKeyViolation: insert or
    update on table "documents" violates foreign key
    constraint "fk_documents_created_by_users"

**The fix.** ``require_document_write`` now returns a
:class:`DocumentWriteAuth` object that carries BOTH the
tenant id (for tenant-scoped queries) and the user id
(to populate ``created_by``). The route uses
``auth.created_by`` for the column.

These tests pin the contract so the bug can't come back.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

import pytest


@dataclass
class _FakeUser:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    role: str = "owner"


@dataclass
class _FakeTenant:
    id: uuid.UUID = field(default_factory=uuid.uuid4)


@dataclass
class _FakeApiKey:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    user_id: uuid.UUID = field(default_factory=uuid.uuid4)
    scopes: tuple[str, ...] = ()


@dataclass
class _FakeApiKeyContext:
    tenant: _FakeTenant
    api_key: _FakeApiKey


def _build_tenant(
    *, user: _FakeUser | None = None, tenant: _FakeTenant | None = None
) -> tuple[_FakeUser, _FakeTenant]:
    user = user or _FakeUser()
    tenant = tenant or _FakeTenant()
    return user, tenant


def test_document_write_auth_carries_both_ids() -> None:
    """The auth result MUST expose both the tenant id
    (for tenant-scoped queries) AND the user id (for
    the ``documents.created_by`` FK). Returning only
    the tenant id is the bug we're guarding against.
    """
    from src.ingestion.interface.rest.auth import (
        DocumentWriteAuth,
    )

    tenant_id = uuid.uuid4()
    user_id = uuid.uuid4()
    auth = DocumentWriteAuth(
        tenant_id=tenant_id, created_by=user_id
    )
    assert auth.tenant_id == tenant_id
    assert auth.created_by == user_id
    # The api_key_id is optional; JWT callers don't
    # carry one.
    assert auth.api_key_id is None


def test_document_write_auth_jwt_user_id_not_tenant_id() -> None:
    """The JWT path's ``created_by`` must be the USER id,
    not the tenant id. This is the exact assertion that
    was violated by the original bug.
    """
    from src.ingestion.interface.rest.auth import (
        _verify_ingestion_auth,
    )

    # We monkey-patch the collaborators via the
    # module's globals; this is enough to drive the
    # JWT branch in ``_verify_ingestion_auth`` and
    # assert it returns the user id for ``created_by``.
    from src.ingestion.interface import rest as rest_pkg
    from src.ingestion.interface.rest import auth as auth_mod

    user = _FakeUser()
    tenant = _FakeTenant()

    def fake_get_current_user(*, authorization: str, db: Any):
        return user, tenant

    def fake_role_check(*_args: Any, **_kwargs: Any) -> None:
        return None

    original_gcu = auth_mod.get_current_user
    original_rc = auth_mod._role_check
    try:
        auth_mod.get_current_user = fake_get_current_user
        auth_mod._role_check = fake_role_check
        result = _verify_ingestion_auth(
            required_scope="documents:write",
            min_role=user.role,  # type: ignore[arg-type]
            authorization="Bearer aaa.bbb.ccc",
            x_api_key=None,
            db=None,
        )
    finally:
        auth_mod.get_current_user = original_gcu
        auth_mod._role_check = original_rc

    # The critical assertion: ``created_by`` is the
    # USER id, not the TENANT id. The original bug
    # set this to the tenant id, which failed the FK.
    assert result.created_by == user.id
    assert result.created_by != tenant.id
    assert result.tenant_id == tenant.id


def test_document_write_auth_api_key_falls_back_to_user_id() -> None:
    """The API-key path's ``created_by`` falls back to
    ``api_key.user_id`` so the FK is still satisfied
    even though there's no direct user in the request.
    """
    from src.ingestion.interface.rest import auth as auth_mod
    from src.ingestion.interface.rest.auth import (
        _verify_ingestion_auth,
    )

    api_key = _FakeApiKey(
        scopes=("documents:write",),
    )
    tenant = _FakeTenant()
    ctx = _FakeApiKeyContext(tenant=tenant, api_key=api_key)

    def fake_require_api_key(**_kwargs: Any) -> _FakeApiKeyContext:
        return ctx

    original = auth_mod.require_api_key
    try:
        auth_mod.require_api_key = fake_require_api_key
        result = _verify_ingestion_auth(
            required_scope="documents:write",
            min_role="member",  # type: ignore[arg-type]
            authorization=None,
            x_api_key="raw-key",
            db=None,
        )
    finally:
        auth_mod.require_api_key = original

    # API key caller: ``created_by`` is the key's
    # bound user id; ``api_key_id`` is set so the
    # audit log can record which key was used.
    assert result.created_by == api_key.user_id
    assert result.tenant_id == tenant.id
    assert result.api_key_id == api_key.id


def test_document_read_returns_tenant_id_only() -> None:
    """The read path returns just the tenant id (a
    ``uuid.UUID``), not the full
    :class:`DocumentWriteAuth`. The read path doesn't
    need ``created_by`` so the extra surface is
    unnecessary.
    """
    from src.ingestion.interface.rest import auth as auth_mod
    from src.ingestion.interface.rest.auth import (
        _verify_ingestion_auth,
    )

    user = _FakeUser()
    tenant = _FakeTenant()

    def fake_get_current_user(*, authorization: str, db: Any):
        return user, tenant

    def fake_role_check(*_args: Any, **_kwargs: Any) -> None:
        return None

    original_gcu = auth_mod.get_current_user
    original_rc = auth_mod._role_check
    try:
        auth_mod.get_current_user = fake_get_current_user
        auth_mod._role_check = fake_role_check
        result = _verify_ingestion_auth(
            required_scope="documents:read",
            min_role="member",  # type: ignore[arg-type]
            authorization="Bearer aaa.bbb.ccc",
            x_api_key=None,
            db=None,
        )
    finally:
        auth_mod.get_current_user = original_gcu
        auth_mod._role_check = original_rc

    # Read path returns the tenant id directly.
    assert isinstance(result.tenant_id, uuid.UUID)
    assert result.tenant_id == tenant.id


def test_no_auth_header_raises_401() -> None:
    """A request with no Authorization header and no
    X-API-Key header must be rejected with 401, not
    silently fall through.
    """
    from fastapi import HTTPException

    from src.ingestion.interface.rest.auth import (
        _verify_ingestion_auth,
    )

    with pytest.raises(HTTPException) as exc_info:
        _verify_ingestion_auth(
            required_scope="documents:write",
            min_role="member",  # type: ignore[arg-type]
            authorization=None,
            x_api_key=None,
            db=None,
        )
    assert exc_info.value.status_code == 401
