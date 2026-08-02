"""
Unit tests for Knowledge Graph REST API router.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.core.database import Base
from src.identity.infrastructure.models import TenantModel, UserModel
from src.identity.infrastructure.security import create_access_token
from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import EntityType, GraphPath, RelationshipType
from src.knowledge_graph.infrastructure.repositories import (
    GraphEntityRepository,
    GraphRelationshipRepository,
)
from src.main import app


from src.core.dependencies import get_db


@pytest.fixture
def client(db_session, tenant_id, user_id):
    """TestClient authenticated as the tenant owner."""
    token = create_access_token(
        str(user_id),
        extra_claims={"tenant_id": str(tenant_id), "role": "owner"},
    )
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        test_client.headers = {"Authorization": f"Bearer {token}"}
        yield test_client
    app.dependency_overrides.clear()


def test_get_entities_empty(client, tenant_id):
    response = client.get("/api/v1/graph/entities")
    assert response.status_code == 200
    data = response.json()
    # The route returns the canonical paginated shape
    # directly: ``{"items": [...], "total": N, "limit": L, "offset": O}``.
    # The test asserts against that shape (not the
    # ``BaseAppException`` envelope, which is only
    # used for error responses).
    assert data["items"] == []
    assert data["total"] == 0


def test_get_entities_with_data(client, db_session, tenant_id):
    entity_repo = GraphEntityRepository(db_session)
    e = entity_repo.create(
        GraphEntity.create(tenant_id=tenant_id, name="Cortex", entity_type=EntityType.PROJECT)
    )
    db_session.commit()

    response = client.get("/api/v1/graph/entities")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Cortex"


def test_get_entity_by_id(client, db_session, tenant_id):
    entity_repo = GraphEntityRepository(db_session)
    e = entity_repo.create(
        GraphEntity.create(tenant_id=tenant_id, name="FastAPI", entity_type=EntityType.TECHNOLOGY)
    )
    db_session.commit()

    response = client.get(f"/api/v1/graph/entities/{e.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(e.id)
    assert data["name"] == "FastAPI"


def test_get_entity_not_found(client, tenant_id):
    missing_id = uuid.uuid4()
    response = client.get(f"/api/v1/graph/entities/{missing_id}")
    assert response.status_code == 404


def test_search_graph(client, db_session, tenant_id):
    entity_repo = GraphEntityRepository(db_session)
    entity_repo.create(
        GraphEntity.create(tenant_id=tenant_id, name="PostgreSQL", entity_type=EntityType.TECHNOLOGY)
    )
    db_session.commit()

    # The route parameter is ``query=``, not ``q=``.
    response = client.get("/api/v1/graph/search", params={"query": "Postgre"})
    assert response.status_code == 200
    data = response.json()
    assert "entities" in data
    assert len(data["entities"]) == 1


def test_get_path(client, db_session, tenant_id):
    entity_repo = GraphEntityRepository(db_session)
    rel_repo = GraphRelationshipRepository(db_session)

    e1 = entity_repo.create(
        GraphEntity.create(tenant_id=tenant_id, name="A", entity_type=EntityType.CONCEPT)
    )
    e2 = entity_repo.create(
        GraphEntity.create(tenant_id=tenant_id, name="B", entity_type=EntityType.CONCEPT)
    )
    rel_repo.create(
        GraphRelationship.create(
            tenant_id=tenant_id,
            source_entity_id=e1.id,
            target_entity_id=e2.id,
            relationship_type=RelationshipType.USES,
        )
    )
    db_session.commit()

    # The route parameters are ``source=`` and ``target=``,
    # not ``start_id=`` / ``end_id=``.
    response = client.get(
        "/api/v1/graph/path", params={"source": str(e1.id), "target": str(e2.id)}
    )
    assert response.status_code == 200
    data = response.json()
    assert data is not None
    assert data["depth"] == 1


@patch("src.knowledge_graph.application.extraction.GraphExtractionPipeline.extract_for_document")
def test_extract_from_document(mock_extract, client, tenant_id):
    doc_id = uuid.uuid4()
    mock_extract.return_value = MagicMock(
        document_id=doc_id,
        tenant_id=uuid.uuid4(),
        entities=[],
        relationships=[],
        metrics=MagicMock(
            entities_extracted=3,
            relationships_extracted=2,
            as_dict=lambda: {
                "entities_extracted": 3,
                "relationships_extracted": 2,
            },
        ),
    )

    response = client.post(f"/api/v1/graph/extract/{doc_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["entities_count"] == 0  # mocked return had no entities
    assert "metrics" in data
