"""
Test fixtures for the identity module tests.

Provides a fresh in-memory SQLite database per test, with the
identity schema created. The session is bound to a sync engine so
the SQLAlchemy models and repositories work the same way they do
in production (just against SQLite, not Postgres).
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.identity.domain.entities import Tenant
from src.core.database import Base


@pytest.fixture
def db_session():
    """Yield a SQLAlchemy session backed by an in-memory SQLite DB."""
    # Import models so they register on `Base.metadata` before we
    # create the schema.
    from src.identity.infrastructure import models  # noqa: F401

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
