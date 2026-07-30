"""
Fixtures for MCP integration tests.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.identity.infrastructure import models as _identity_models  # noqa: F401
from src.mcp.infrastructure import models as _mcp_models  # noqa: F401


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
    from src.identity.infrastructure.models import TenantModel, UserModel

    tenant = TenantModel(
        id=uuid.uuid4(),
        name="Acme Integration",
        slug="acme-integration",
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
