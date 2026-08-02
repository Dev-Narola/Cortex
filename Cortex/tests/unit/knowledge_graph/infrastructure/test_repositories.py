"""
Unit tests for Knowledge Graph repositories.
"""

from __future__ import annotations

import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import pytest

from src.core.database import Base
from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import EntityType, RelationshipType
from src.knowledge_graph.infrastructure.models import KGEntityModel, KGRelationModel
from src.knowledge_graph.infrastructure.repositories import (
    GraphEntityRepository,
    GraphRelationshipRepository,
)
from src.shared.exceptions import ConflictException


@pytest.fixture
def sync_db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    yield session
    session.close()


def test_entity_repository_crud(sync_db_session):
    repo = GraphEntityRepository(sync_db_session)
    tenant_id = uuid.uuid4()

    entity = GraphEntity.create(
        tenant_id=tenant_id,
        name="FastAPI",
        entity_type=EntityType.TECHNOLOGY,
        description="Web framework",
    )

    created = repo.create(entity)
    sync_db_session.commit()

    assert created.id == entity.id
    assert created.name == "FastAPI"

    fetched = repo.get(tenant_id=tenant_id, entity_id=entity.id)
    assert fetched is not None
    assert fetched.name == "FastAPI"

    # Duplicate name + type conflict
    dup_entity = GraphEntity.create(
        tenant_id=tenant_id,
        name="FastAPI",
        entity_type=EntityType.TECHNOLOGY,
    )
    with pytest.raises(ConflictException):
        repo.create(dup_entity)
    sync_db_session.rollback()

    # Search
    results = repo.search(tenant_id=tenant_id, query="Fast")
    assert len(results) == 1
    assert results[0].name == "FastAPI"

    # Delete
    deleted = repo.delete(tenant_id=tenant_id, entity_id=entity.id)
    sync_db_session.commit()
    assert deleted is True
    assert repo.get(tenant_id=tenant_id, entity_id=entity.id) is None


def test_relationship_repository_crud(sync_db_session):
    entity_repo = GraphEntityRepository(sync_db_session)
    rel_repo = GraphRelationshipRepository(sync_db_session)

    tenant_id = uuid.uuid4()
    e1 = entity_repo.create(GraphEntity.create(tenant_id=tenant_id, name="Cortex", entity_type=EntityType.PROJECT))
    e2 = entity_repo.create(GraphEntity.create(tenant_id=tenant_id, name="FastAPI", entity_type=EntityType.TECHNOLOGY))
    sync_db_session.commit()

    rel = GraphRelationship.create(
        tenant_id=tenant_id,
        source_entity_id=e1.id,
        target_entity_id=e2.id,
        relationship_type=RelationshipType.USES,
        confidence=0.9,
    )

    created = rel_repo.create(rel)
    sync_db_session.commit()

    assert created.id == rel.id

    fetched_rels = rel_repo.list_for_entity(tenant_id=tenant_id, entity_id=e1.id)
    assert len(fetched_rels) == 1
    assert fetched_rels[0].relationship_type == RelationshipType.USES
