"""
Unit tests for Knowledge Graph domain entities and value objects.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import EntityType, GraphPath, RelationshipType
from src.shared.exceptions import ValidationException


def test_graph_entity_create_and_validation():
    tenant_id = uuid.uuid4()
    entity = GraphEntity.create(
        tenant_id=tenant_id,
        name="  Cortex Platform  ",
        entity_type="project",
        description="Multi-tenant AI Knowledge Platform",
        properties={"version": "1.0"},
    )

    assert entity.tenant_id == tenant_id
    assert entity.name == "Cortex Platform"
    assert entity.entity_type == EntityType.PROJECT
    assert entity.description == "Multi-tenant AI Knowledge Platform"
    assert entity.properties == {"version": "1.0"}


def test_graph_entity_invalid_name():
    with pytest.raises(ValidationException):
        GraphEntity.create(
            tenant_id=uuid.uuid4(),
            name="",
            entity_type=EntityType.CONCEPT,
        )


def test_graph_relationship_create_and_validation():
    tenant_id = uuid.uuid4()
    src_id = uuid.uuid4()
    tgt_id = uuid.uuid4()

    rel = GraphRelationship.create(
        tenant_id=tenant_id,
        source_entity_id=src_id,
        target_entity_id=tgt_id,
        relationship_type="uses",
        confidence=0.95,
    )

    assert rel.tenant_id == tenant_id
    assert rel.source_entity_id == src_id
    assert rel.target_entity_id == tgt_id
    assert rel.relationship_type == RelationshipType.USES
    assert rel.confidence == 0.95


def test_graph_relationship_self_loop_forbidden():
    tenant_id = uuid.uuid4()
    same_id = uuid.uuid4()

    with pytest.raises(ValidationException):
        GraphRelationship.create(
            tenant_id=tenant_id,
            source_entity_id=same_id,
            target_entity_id=same_id,
            relationship_type=RelationshipType.USES,
        )


def test_graph_path_value_object():
    tenant_id = uuid.uuid4()
    e1 = GraphEntity.create(tenant_id=tenant_id, name="A", entity_type=EntityType.CONCEPT)
    e2 = GraphEntity.create(tenant_id=tenant_id, name="B", entity_type=EntityType.CONCEPT)
    rel = GraphRelationship.create(
        tenant_id=tenant_id,
        source_entity_id=e1.id,
        target_entity_id=e2.id,
        relationship_type=RelationshipType.USES,
    )

    path = GraphPath(nodes=(e1, e2), relationships=(rel,), depth=1)
    assert not path.is_trivial()
    assert path.depth == 1
    assert len(path.nodes) == 2
    assert len(path.relationships) == 1

    path_dict = path.to_dict()
    assert path_dict["depth"] == 1
    assert len(path_dict["nodes"]) == 2
