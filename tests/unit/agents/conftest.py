"""
Shared fixtures for the V6 agent tests.

A fresh in-memory SQLite database per test, with the
identity + agents + tools + execution + limits schemas
all registered. The session is committed in the
fixture; tests are responsible for their own rollback
semantics (most do not, the per-test engine is
discarded at teardown).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base


# Import every model that the V6 contexts touch so
# ``Base.metadata.create_all`` knows about every table.
# The list is explicit (rather than ``import src.*``)
# so a missing import surfaces as a real error at
# import time, not a missing table at create-time.
from src.identity.infrastructure import models as _identity_models  # noqa: F401
from src.agents.infrastructure import models as _agents_models  # noqa: F401
from src.tools.infrastructure import models as _tools_models  # noqa: F401
from src.execution.infrastructure import models as _execution_models  # noqa: F401
from src.limits.infrastructure import models as _limits_models  # noqa: F401


@pytest.fixture
def engine():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db_session(engine):
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    # Seed a tenant + user so FKs are satisfied and the
    # auth/identity tests have a real identity to bind
    # to.
    from src.identity.infrastructure.models import TenantModel, UserModel

    tenant = TenantModel(
        id=uuid.uuid4(),
        name="Acme",
        slug="acme",
        plan="free",
        settings={},
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    user = UserModel(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="owner@acme.com",
        password_hash="x",
        role="owner",
        is_active=True,
        full_name="Owner",
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
        name="Other",
        slug="other",
        plan="free",
        settings={},
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(t)
    db_session.commit()
    return t.id
