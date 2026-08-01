"""
Security and tenant isolation unit tests for Knowledge Graph context.
"""

from __future__ import annotations

import uuid

import pytest

from src.knowledge_graph.application.query.traversal import GraphSearchService, GraphTraversalService
from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import EntityType, RelationshipType
from src.knowledge_graph.infrastructure.repositories import (
    GraphEntityRepository,
    GraphRelationshipRepository,
)
from src.shared.exceptions import NotFoundException, UnauthorizedException, ValidationException


def test_tenant_cannot_read_other_tenant_entity(db_session, tenant_id, second_tenant_id):
    repo = GraphEntityRepository(db_session)
    e = repo.create(GraphEntity.create(tenant_id=tenant_id, name="SecretA", entity_type=EntityType.CONCEPT))
    db_session.commit()

    # Reading with second_tenant_id should return None
    found = repo.get(tenant_id=second_tenant_id, entity_id=e.id)
    assert found is None


def test_tenant_cannot_delete_other_tenant_entity(db_session, tenant_id, second_tenant_id):
    repo = GraphEntityRepository(db_session)
    e = repo.create(GraphEntity.create(tenant_id=tenant_id, name="SecretA", entity_type=EntityType.CONCEPT))
    db_session.commit()

    # Deleting with second_tenant_id should return False
    deleted = repo.delete(tenant_id=second_tenant_id, entity_id=e.id)
    assert deleted is False

    # Original entity still exists
    assert repo.get(tenant_id=tenant_id, entity_id=e.id) is not None


def test_graph_traversal_never_crosses_tenant_boundary(db_session, tenant_id, second_tenant_id):
    entity_repo = GraphEntityRepository(db_session)
    rel_repo = GraphRelationshipRepository(db_session)

    # Tenant A nodes
    a1 = entity_repo.create(GraphEntity.create(tenant_id=tenant_id, name="A1", entity_type=EntityType.CONCEPT))
    a2 = entity_repo.create(GraphEntity.create(tenant_id=tenant_id, name="A2", entity_type=EntityType.CONCEPT))
    rel_repo.create(
        GraphRelationship.create(
            tenant_id=tenant_id,
            source_entity_id=a1.id,
            target_entity_id=a2.id,
            relationship_type=RelationshipType.USES,
        )
    )

    # Tenant B nodes
    b1 = entity_repo.create(GraphEntity.create(tenant_id=second_tenant_id, name="B1", entity_type=EntityType.CONCEPT))
    db_session.commit()

    traversal_svc = GraphTraversalService(db_session)

    # Tenant B querying neighbors of a1 should raise NotFoundException
    with pytest.raises(NotFoundException):
        traversal_svc.find_neighbors(tenant_id=second_tenant_id, entity_id=a1.id)

    # Tenant A path between a1 and b1 should return None
    path = traversal_svc.find_shortest_path(tenant_id=tenant_id, source_id=a1.id, target_id=b1.id)
    assert path is None
