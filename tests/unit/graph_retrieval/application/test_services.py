"""
Unit tests for GraphRetrievalService — hybrid retrieval combining
Knowledge Graph facts with vector search results.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.identity.infrastructure import models as _identity_models  # noqa: F401
from src.knowledge_graph.infrastructure import models as _kg_models  # noqa: F401
from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import EntityType, RelationshipType
from src.knowledge_graph.infrastructure.repositories import (
    GraphEntityRepository,
    GraphRelationshipRepository,
)
from src.graph_retrieval.application.services import GraphRetrievalService
from src.shared.exceptions import ValidationException


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
        name="RetCo",
        slug="retco",
        plan="free",
        settings={},
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    user = UserModel(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="ret@retco.com",
        password_hash="x",
        role="owner",
        is_active=True,
        full_name="Retriever",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add_all([tenant, user])
    session.commit()
    yield session
    session.close()


@pytest.fixture
def tenant_id(db_session):
    from src.identity.infrastructure.models import TenantModel

    return db_session.query(TenantModel).first().id


def _seed_entities(db_session, tenant_id):
    """Create a few entities and a relationship."""
    entity_repo = GraphEntityRepository(db_session)
    rel_repo = GraphRelationshipRepository(db_session)

    fastapi = entity_repo.create(
        GraphEntity.create(tenant_id=tenant_id, name="FastAPI", entity_type=EntityType.TECHNOLOGY)
    )
    cortex = entity_repo.create(
        GraphEntity.create(tenant_id=tenant_id, name="Cortex", entity_type=EntityType.PROJECT)
    )
    rel = rel_repo.create(
        GraphRelationship.create(
            tenant_id=tenant_id,
            source_entity_id=cortex.id,
            target_entity_id=fastapi.id,
            relationship_type=RelationshipType.USES,
            confidence=0.95,
        )
    )
    db_session.commit()
    return fastapi, cortex, rel


class TestGraphRetrievalService:
    """Tests for the graph-aware retrieval service."""

    def test_retrieve_entities(self, db_session, tenant_id):
        fastapi, cortex, _ = _seed_entities(db_session, tenant_id)
        service = GraphRetrievalService(db=db_session)

        entities = service.retrieve_entities(tenant_id=tenant_id, query="FastAPI")
        names = [e.name for e in entities]
        assert "FastAPI" in names

    def test_retrieve_entities_empty_query(self, db_session, tenant_id):
        _seed_entities(db_session, tenant_id)
        service = GraphRetrievalService(db=db_session)

        entities = service.retrieve_entities(tenant_id=tenant_id, query="")
        assert entities == []

    def test_retrieve_entities_invalid_tenant(self, db_session, tenant_id):
        _seed_entities(db_session, tenant_id)
        service = GraphRetrievalService(db=db_session)

        with pytest.raises(ValidationException):
            service.retrieve_entities(tenant_id="not-a-uuid", query="FastAPI")

    def test_retrieve_relationships(self, db_session, tenant_id):
        fastapi, cortex, rel = _seed_entities(db_session, tenant_id)
        service = GraphRetrievalService(db=db_session)

        rels = service.retrieve_relationships(
            tenant_id=tenant_id, entity_ids=[cortex.id, fastapi.id]
        )
        assert len(rels) >= 1
        assert rels[0].relationship_type == RelationshipType.USES

    def test_retrieve_relationships_empty_ids(self, db_session, tenant_id):
        _seed_entities(db_session, tenant_id)
        service = GraphRetrievalService(db=db_session)

        rels = service.retrieve_relationships(tenant_id=tenant_id, entity_ids=[])
        assert rels == []

    @pytest.mark.asyncio
    async def test_retrieve_hybrid(self, db_session, tenant_id):
        _seed_entities(db_session, tenant_id)
        service = GraphRetrievalService(db=db_session)

        result = await service.retrieve(
            tenant_id=tenant_id, query="Cortex uses FastAPI", limit=5
        )

        assert "entities" in result
        assert "relationships" in result
        assert "context_text" in result
        assert "graph_facts" in result
        assert len(result["entities"]) >= 1

    @pytest.mark.asyncio
    async def test_retrieve_invalid_query(self, db_session, tenant_id):
        service = GraphRetrievalService(db=db_session)

        with pytest.raises(ValidationException):
            await service.retrieve(tenant_id=tenant_id, query="   ", limit=5)

    @pytest.mark.asyncio
    async def test_retrieve_invalid_tenant(self, db_session, tenant_id):
        service = GraphRetrievalService(db=db_session)

        with pytest.raises(ValidationException):
            await service.retrieve(tenant_id="bad", query="hello", limit=5)
