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
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.identity.domain.entities import Role, Tenant, User
from src.identity.infrastructure.repositories import TenantRepository, UserRepository
from src.identity.infrastructure.security import hash_password
from src.ingestion.infrastructure.storage import LocalStorage
from src.ingestion.interface.rest.auth import require_document_read, require_document_write
from src.ingestion.interface.rest.routes import get_s3_storage
from src.main import app
from src.core.database import Base, get_db


@pytest.fixture
def db_session():
    """Yield a SQLAlchemy session backed by an in-memory SQLite DB."""
    # Import models so they register on Base.metadata before schema creation.
    # Both identity and ingestion models are needed because documents has FKs
    # to tenants and users.
    from src.identity.infrastructure import models as _identity_models  # noqa: F401
    from src.ingestion.infrastructure import models as _ingestion_models  # noqa: F401

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
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
# Convenience builders
# ---------------------------------------------------------------------------


def _safe_slug(prefix: str = "tenant") -> str:
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
    """Yield two independent (tenant, user) pairs for cross-tenant tests."""
    t1, u1 = make_tenant()
    t2, u2 = make_tenant()
    return (t1, u1), (t2, u2)


# ---------------------------------------------------------------------------
# Auth + HTTP client fixtures for route-level tests
# ---------------------------------------------------------------------------


@pytest.fixture
def tenant_id() -> uuid.UUID:
    """A fixed UUID representing the authenticated tenant in route-level tests."""
    return uuid.uuid4()


@pytest.fixture
def setup_auth(tenant_id):
    """
    Override FastAPI auth dependencies so tests don't need real tokens.
    Both read and write dependencies return the same tenant_id.
    """
    app.dependency_overrides[require_document_read] = lambda: tenant_id
    app.dependency_overrides[require_document_write] = lambda: tenant_id
    yield
    app.dependency_overrides.pop(require_document_read, None)
    app.dependency_overrides.pop(require_document_write, None)


@pytest_asyncio.fixture
async def client(db_session, setup_auth):
    """
    Async HTTP client wired to the test's in-memory SQLite session.

    Overrides get_db so every route handler uses the same session the test
    uses to seed data. Without this, seeded rows are invisible to the app
    because they live in a different in-memory DB.
    """
    app.dependency_overrides[get_db] = lambda: db_session
    local_storage = LocalStorage()
    app.dependency_overrides[get_s3_storage] = lambda: local_storage

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http

    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_s3_storage, None)

