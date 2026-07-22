from __future__ import annotations

import uuid
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Import all ORM models so their tables are registered on the shared Base
# before create_all() is called. Order doesn't matter; the import is enough.
import src.identity.infrastructure.models  # noqa: F401
import src.ingestion.infrastructure.models  # noqa: F401
from src.platform.database import Base, get_db
from src.main import app

# ---------------------------------------------------------------------------
# In-memory SQLite engine — StaticPool means every connection shares the
# same in-memory database, which is what we need so that rows committed by
# the test session are visible to the TestClient's request handler.
# ---------------------------------------------------------------------------

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create all tables once per test session."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def reset_tables(setup_database):
    """Truncate all rows between tests for isolation without recreating schema."""
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Provide a single SQLAlchemy session for a test."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    """FastAPI TestClient with the DB dependency wired to the test session."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    # Only remove the DB override; auth overrides are managed per-test
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def tenant_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def user_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def setup_auth(tenant_id):
    """Override auth dependencies so tests don't need real API keys."""
    from src.ingestion.interface.rest.auth import (
        require_document_read,
        require_document_write,
    )

    app.dependency_overrides[require_document_read] = lambda: tenant_id
    app.dependency_overrides[require_document_write] = lambda: tenant_id
    yield
    app.dependency_overrides.pop(require_document_read, None)
    app.dependency_overrides.pop(require_document_write, None)
