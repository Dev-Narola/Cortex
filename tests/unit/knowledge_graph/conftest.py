"""
Shared fixtures for the V7 Knowledge Graph tests.

A fresh in-memory SQLite database per test, with the
identity + knowledge_graph schemas registered. Follows
the same pattern as ``tests/unit/agents/conftest.py``.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base

# Import models so ``Base.metadata.create_all`` knows about them.
from src.identity.infrastructure import models as _identity_models  # noqa: F401
from src.knowledge_graph.infrastructure import models as _kg_models  # noqa: F401

from src.identity.infrastructure.security import hash_password

from sqlalchemy.pool import StaticPool


# A real bcrypt hash of ``"x"`` so the User domain
# constructor's strict password validation passes when
# the test fixtures load the row back into a User object.
# Pre-computed so the conftest is cheap; the value
# corresponds to bcrypt(plain="x") at the cost the
# production default uses.
_TEST_PASSWORD_HASH = hash_password("x")


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db_session(engine):
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    from src.identity.infrastructure.models import TenantModel, UserModel

    tenant = TenantModel(
        id=uuid.uuid4(),
        name="GraphCo",
        slug="graphco",
        plan="free",
        settings={},
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    user = UserModel(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="admin@graphco.com",
        password_hash=_TEST_PASSWORD_HASH,
        role="owner",
        is_active=True,
        full_name="Admin",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add_all([tenant, user])
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def tenant_id(db_session):
    from src.identity.infrastructure.models import TenantModel

    return db_session.query(TenantModel).first().id


@pytest.fixture
def user_id(db_session):
    from src.identity.infrastructure.models import UserModel

    return db_session.query(UserModel).first().id


@pytest.fixture
def second_tenant_id(db_session):
    """A second tenant for cross-tenant isolation tests."""
    from src.identity.infrastructure.models import TenantModel

    t = TenantModel(
        id=uuid.uuid4(),
        name="OtherOrg",
        slug="otherorg",
        plan="free",
        settings={},
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(t)
    db_session.commit()
    return t.id
