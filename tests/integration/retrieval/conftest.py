"""
Test fixtures for the retrieval module integration tests.

Mirrors the ingestion conftest setup: in-memory SQLite DB with
all models registered, plus a db_session fixture tests can use.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.identity.domain.entities import Role, Tenant, User
from src.identity.infrastructure.repositories import TenantRepository, UserRepository
from src.identity.infrastructure.security import hash_password
from src.core.database import Base


@pytest.fixture
def db_session():
    """Yield a SQLAlchemy session backed by an in-memory SQLite DB."""
    # Import all models so they register on Base.metadata before schema creation.
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
        Tenant.reset_slug_registry()


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
