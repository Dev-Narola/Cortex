"""
Test fixtures for the ingestion module tests.

Provides a fresh in-memory SQLite database per test with the
identity + ingestion schema created, plus a small helper to
create a tenant + user the test can attach documents to.

The session is bound to a sync engine so the SQLAlchemy models
and repositories work the same way they do in production (just
against SQLite, not Postgres).
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.identity.domain.entities import Role, Tenant, User
from src.identity.infrastructure.repositories import (
    TenantRepository,
    UserRepository,
)
from src.identity.infrastructure.security import hash_password
from src.platform.database import Base


@pytest.fixture
def db_session():
    """Yield a SQLAlchemy session backed by an in-memory SQLite DB."""
    # Import models so they register on `Base.metadata` before we
    # create the schema. Both identity and ingestion models are
    # needed because the `documents` table has FKs to `tenants`
    # and `users`.
    from src.identity.infrastructure import models as _identity_models  # noqa: F401
    from src.ingestion.infrastructure import models as _ingestion_models  # noqa: F401

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
        # Tests can create Tenant entities and they land in the
        # in-process slug registry; clear it so order is irrelevant.
        Tenant.reset_slug_registry()


# ---------------------------------------------------------------------------
# Convenience builders — tests use these to skip the boilerplate
# of "make a tenant, make a user, attach to session" so each test
# can focus on what it's actually testing.
# ---------------------------------------------------------------------------


def _safe_slug(prefix: str = "tenant") -> str:
    """
    Build a slug that won't collide with the in-process registry.

    A plain `f"{prefix}-{uuid.uuid4().hex[:8]}"` would do, but we
    also strip leading hyphens and clamp to the regex the
    `Tenant` entity enforces.
    """
    raw = f"{prefix}-{uuid.uuid4().hex[:10]}".lower()
    return raw[:60]


@pytest.fixture
def make_tenant(db_session):
    """Return a factory for persisted Tenant + User pairs."""

    def _factory(*, name: str | None = None, slug: str | None = None):
        repo = TenantRepository(db_session)
        users = UserRepository(db_session)
        tenant = repo.create(
            Tenant.create(
                name=name or f"Tenant {uuid.uuid4().hex[:6]}",
                slug=slug or _safe_slug(),
            )
        )
        user = users.create(
            User.create(
                tenant_id=tenant.id,
                email=f"u-{uuid.uuid4().hex[:8]}@example.com",
                hashed_password=hash_password("TestPassword123!"),
                role=Role.MEMBER,
            )
        )
        db_session.commit()
        return tenant, user

    return _factory


@pytest.fixture
def two_tenants(db_session, make_tenant):
    """Yield two independent `(tenant, user)` pairs for cross-tenant tests."""
    t1, u1 = make_tenant()
    t2, u2 = make_tenant()
    return (t1, u1), (t2, u2)
