"""
Unit tests for GraphTraversalService and GraphSearchService.
"""

from __future__ import annotations

import uuid

import pytest

from src.knowledge_graph.application.traversal import (
    GraphSearchService,
    GraphTraversalService,
)
from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import EntityType, RelationshipType
from src.knowledge_graph.infrastructure.repositories import (
    GraphEntityRepository,
    GraphRelationshipRepository,
)
from src.shared.exceptions import NotFoundException, ValidationException


def _seed_graph(db_session, tenant_id):
    """Seed a small graph: A --USES--> B --DEPENDS_ON--> C."""
    entity_repo = GraphEntityRepository(db_session)
    rel_repo = GraphRelationshipRepository(db_session)

    a = entity_repo.create(
        GraphEntity.create(tenant_id=tenant_id, name="ServiceA", entity_type=EntityType.PROJECT)
    )
    b = entity_repo.create(
        GraphEntity.create(tenant_id=tenant_id, name="ServiceB", entity_type=EntityType.TECHNOLOGY)
    )
    c = entity_repo.create(
        GraphEntity.create(tenant_id=tenant_id, name="ServiceC", entity_type=EntityType.CONCEPT)
    )

    r_ab = rel_repo.create(
        GraphRelationship.create(
            tenant_id=tenant_id,
            source_entity_id=a.id,
            target_entity_id=b.id,
            relationship_type=RelationshipType.USES,
            confidence=0.9,
        )
    )
    r_bc = rel_repo.create(
        GraphRelationship.create(
            tenant_id=tenant_id,
            source_entity_id=b.id,
            target_entity_id=c.id,
            relationship_type=RelationshipType.DEPENDS_ON,
            confidence=0.8,
        )
    )
    db_session.commit()

    return a, b, c, r_ab, r_bc


class TestGraphTraversalService:
    """Tests for neighbor finding, shortest path, and related entity queries."""

    def test_find_neighbors_outbound(self, db_session, tenant_id):
        a, b, c, _, _ = _seed_graph(db_session, tenant_id)
        service = GraphTraversalService(db_session)

        neighbors = service.find_neighbors(
            tenant_id=tenant_id, entity_id=a.id, direction="outbound"
        )

        neighbor_ids = {n.id for n in neighbors}
        assert b.id in neighbor_ids
        assert a.id not in neighbor_ids

    def test_find_neighbors_inbound(self, db_session, tenant_id):
        a, b, c, _, _ = _seed_graph(db_session, tenant_id)
        service = GraphTraversalService(db_session)

        neighbors = service.find_neighbors(
            tenant_id=tenant_id, entity_id=b.id, direction="inbound"
        )

        neighbor_ids = {n.id for n in neighbors}
        assert a.id in neighbor_ids

    def test_find_neighbors_both(self, db_session, tenant_id):
        a, b, c, _, _ = _seed_graph(db_session, tenant_id)
        service = GraphTraversalService(db_session)

        neighbors = service.find_neighbors(
            tenant_id=tenant_id, entity_id=b.id, direction="both"
        )

        neighbor_ids = {n.id for n in neighbors}
        assert a.id in neighbor_ids
        assert c.id in neighbor_ids

    def test_find_neighbors_entity_not_found(self, db_session, tenant_id):
        _seed_graph(db_session, tenant_id)
        service = GraphTraversalService(db_session)

        with pytest.raises(NotFoundException):
            service.find_neighbors(
                tenant_id=tenant_id, entity_id=uuid.uuid4()
            )

    def test_find_shortest_path(self, db_session, tenant_id):
        a, b, c, _, _ = _seed_graph(db_session, tenant_id)
        service = GraphTraversalService(db_session)

        path = service.find_shortest_path(
            tenant_id=tenant_id, source_id=a.id, target_id=c.id, max_depth=5
        )

        assert path is not None
        assert len(path.nodes) == 3
        assert path.nodes[0].id == a.id
        assert path.nodes[-1].id == c.id

    def test_find_shortest_path_no_connection(self, db_session, tenant_id):
        a, b, c, _, _ = _seed_graph(db_session, tenant_id)
        service = GraphTraversalService(db_session)

        # Create a fourth, fully isolated entity. The
        # BFS treats the graph as undirected (edges
        # are walked in both directions) so c->a would
        # still be reachable through a->b->c; a node
        # with no edges at all is the only reliable
        # way to test the "no path" branch.
        entity_repo = GraphEntityRepository(db_session)
        iso = entity_repo.create(
            GraphEntity.create(
                tenant_id=tenant_id,
                name="Isolated",
                entity_type=EntityType.CONCEPT,
            )
        )
        db_session.commit()

        path = service.find_shortest_path(
            tenant_id=tenant_id, source_id=iso.id, target_id=a.id, max_depth=5
        )

        assert path is None

    def test_find_related_entities(self, db_session, tenant_id):
        a, b, c, _, _ = _seed_graph(db_session, tenant_id)
        service = GraphTraversalService(db_session)

        related = service.find_related_entities(
            tenant_id=tenant_id, entity_id=a.id, max_depth=3
        )

        related_ids = {r.id for r in related}
        assert b.id in related_ids
        assert c.id in related_ids

    def test_tenant_isolation(self, db_session, tenant_id, second_tenant_id):
        _seed_graph(db_session, tenant_id)
        service = GraphTraversalService(db_session)

        # Second tenant has no graph data
        with pytest.raises(NotFoundException):
            service.find_neighbors(
                tenant_id=second_tenant_id,
                entity_id=uuid.uuid4(),
            )


class TestGraphSearchService:
    """Tests for entity and relationship search."""

    def test_search_entities_by_name(self, db_session, tenant_id):
        _seed_graph(db_session, tenant_id)
        service = GraphSearchService(db_session)

        results = service.search_entities(tenant_id=tenant_id, query="ServiceA")
        assert len(results) >= 1
        assert results[0].name == "ServiceA"

    def test_search_entities_partial_match(self, db_session, tenant_id):
        _seed_graph(db_session, tenant_id)
        service = GraphSearchService(db_session)

        results = service.search_entities(tenant_id=tenant_id, query="Service")
        assert len(results) == 3

    def test_search_entities_no_results(self, db_session, tenant_id):
        _seed_graph(db_session, tenant_id)
        service = GraphSearchService(db_session)

        results = service.search_entities(tenant_id=tenant_id, query="nonexistent")
        assert len(results) == 0

    def test_search_relationships(self, db_session, tenant_id):
        a, b, c, _, _ = _seed_graph(db_session, tenant_id)
        service = GraphSearchService(db_session)

        results = service.search_relationships(
            tenant_id=tenant_id, entity_id=a.id
        )
        assert len(results) >= 1

    def test_search_graph_combined(self, db_session, tenant_id):
        _seed_graph(db_session, tenant_id)
        service = GraphSearchService(db_session)

        result = service.search_graph(tenant_id=tenant_id, query="ServiceA")
        assert "entities" in result
        assert len(result["entities"]) >= 1

    def test_search_entities_tenant_isolation(self, db_session, tenant_id, second_tenant_id):
        _seed_graph(db_session, tenant_id)
        service = GraphSearchService(db_session)

        results = service.search_entities(tenant_id=second_tenant_id, query="Service")
        assert len(results) == 0
