"""
Unit tests for Knowledge Graph GraphQL API router and resolvers.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.identity.infrastructure.security import create_access_token
from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import EntityType, RelationshipType
from src.knowledge_graph.infrastructure.repositories import (
    GraphEntityRepository,
    GraphRelationshipRepository,
)
from src.core.dependencies import get_db
from src.main import app


@pytest.fixture
def client(db_session, tenant_id, user_id):
    """TestClient authenticated with JWT Bearer header."""
    token = create_access_token(
        str(user_id),
        extra_claims={"tenant_id": str(tenant_id), "role": "owner"},
    )
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        test_client.headers = {"Authorization": f"Bearer {token}"}
        yield test_client
    app.dependency_overrides.clear()


def test_graphql_entities_query(client, db_session, tenant_id):
    entity_repo = GraphEntityRepository(db_session)
    entity_repo.create(
        GraphEntity.create(tenant_id=tenant_id, name="GraphQLNode", entity_type=EntityType.TECHNOLOGY)
    )
    db_session.commit()

    query = """
    query {
        entities {
            id
            name
            entityType
        }
    }
    """
    response = client.post("/graphql", json={"query": query})
    assert response.status_code == 200
    res_data = response.json()
    assert "data" in res_data
    entities = res_data["data"]["entities"]
    assert len(entities) == 1
    assert entities[0]["name"] == "GraphQLNode"


def test_graphql_create_entity_mutation(client, tenant_id):
    mutation = """
    mutation {
        createEntity(
            name: "NewEntity",
            entityType: "concept",
            description: "Created via GraphQL"
        ) {
            id
            name
            entityType
            description
        }
    }
    """
    response = client.post("/graphql", json={"query": mutation})
    assert response.status_code == 200
    res_data = response.json()
    assert "data" in res_data
    created = res_data["data"]["createEntity"]
    assert created["name"] == "NewEntity"
    assert created["entityType"] == "concept"


def test_graphql_neighbors_query(client, db_session, tenant_id):
    entity_repo = GraphEntityRepository(db_session)
    rel_repo = GraphRelationshipRepository(db_session)

    e1 = entity_repo.create(GraphEntity.create(tenant_id=tenant_id, name="Node1", entity_type=EntityType.CONCEPT))
    e2 = entity_repo.create(GraphEntity.create(tenant_id=tenant_id, name="Node2", entity_type=EntityType.CONCEPT))
    rel_repo.create(
        GraphRelationship.create(
            tenant_id=tenant_id,
            source_entity_id=e1.id,
            target_entity_id=e2.id,
            relationship_type=RelationshipType.USES,
        )
    )
    db_session.commit()

    query = f"""
    query {{
        neighbors(id: "{e1.id}") {{
            id
            name
        }}
    }}
    """
    response = client.post("/graphql", json={"query": query})
    assert response.status_code == 200
    res_data = response.json()
    neighbors = res_data["data"]["neighbors"]
    assert len(neighbors) == 1
    assert neighbors[0]["name"] == "Node2"
