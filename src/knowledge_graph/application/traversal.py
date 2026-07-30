"""
Graph traversal and search services for the knowledge-graph bounded context.

This module implements Phase 4 of the Knowledge Graph specification:
* GraphTraversalService: Graph exploration algorithms (find neighbors, shortest path,
  related entities, connected documents, dependencies).
* GraphSearchService: Entity/relationship search with exact/partial matching and filtering.

All operations are strictly tenant-scoped and isolated.
"""

from __future__ import annotations

import uuid
from collections import deque
from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.knowledge_graph.domain.entities import GraphEntity, GraphRelationship
from src.knowledge_graph.domain.value_objects import EntityType, GraphPath, RelationshipType
from src.knowledge_graph.infrastructure.models import KGEntityModel, KGRelationModel
from src.knowledge_graph.infrastructure.repositories import (
    GraphEntityRepository,
    GraphRelationshipRepository,
)
from src.shared.exceptions import NotFoundException, ValidationException


class GraphTraversalService:
    """Service providing graph traversal capabilities over a tenant's Knowledge Graph."""

    def __init__(self, db: Session) -> None:
        self._db = db
        self._entity_repo = GraphEntityRepository(db)
        self._rel_repo = GraphRelationshipRepository(db)

    def find_neighbors(
        self,
        *,
        tenant_id: uuid.UUID,
        entity_id: uuid.UUID,
        direction: str = "both",
        relationship_type: RelationshipType | str | None = None,
        limit: int = 50,
    ) -> list[GraphEntity]:
        """Find adjacent neighbor entities for a given start entity."""
        if not isinstance(tenant_id, uuid.UUID) or not isinstance(entity_id, uuid.UUID):
            raise ValidationException(
                message="tenant_id and entity_id must be valid UUIDs",
                code=400,
                data={"field": "id"},
            )

        start_entity = self._entity_repo.get(tenant_id=tenant_id, entity_id=entity_id)
        if start_entity is None:
            raise NotFoundException(
                message=f"entity '{entity_id}' not found",
                code=404,
                data={"entity_id": str(entity_id)},
            )

        if isinstance(relationship_type, str):
            try:
                relationship_type = RelationshipType(relationship_type)
            except ValueError:
                relationship_type = None

        rels = self._rel_repo.list_for_entity(
            tenant_id=tenant_id,
            entity_id=entity_id,
            direction=direction,
            relationship_type=relationship_type,
            limit=limit * 2,
        )

        neighbor_ids: list[uuid.UUID] = []
        for rel in rels:
            if rel.source_entity_id == entity_id:
                neighbor_ids.append(rel.target_entity_id)
            else:
                neighbor_ids.append(rel.source_entity_id)

        # Deduplicate preserving order
        unique_ids = list(dict.fromkeys(neighbor_ids))[:limit]

        neighbors: list[GraphEntity] = []
        for nid in unique_ids:
            node = self._entity_repo.get(tenant_id=tenant_id, entity_id=nid)
            if node is not None:
                neighbors.append(node)

        return neighbors

    def find_shortest_path(
        self,
        *,
        tenant_id: uuid.UUID,
        source_id: uuid.UUID,
        target_id: uuid.UUID,
        max_depth: int = 3,
    ) -> GraphPath | None:
        """Breadth-first search for the shortest path between source and target entities."""
        if not isinstance(tenant_id, uuid.UUID) or not isinstance(source_id, uuid.UUID) or not isinstance(target_id, uuid.UUID):
            raise ValidationException(
                message="IDs must be valid UUIDs",
                code=400,
                data={"field": "id"},
            )

        source_node = self._entity_repo.get(tenant_id=tenant_id, entity_id=source_id)
        target_node = self._entity_repo.get(tenant_id=tenant_id, entity_id=target_id)
        if source_node is None or target_node is None:
            return None

        if source_id == target_id:
            return GraphPath(nodes=(source_node,), relationships=(), depth=0)

        max_depth = max(1, min(max_depth, 5))

        # BFS Queue holds tuples of (current_entity_id, list_of_node_ids, list_of_relationships)
        queue: deque[tuple[uuid.UUID, list[uuid.UUID], list[GraphRelationship]]] = deque(
            [(source_id, [source_id], [])]
        )
        visited: set[uuid.UUID] = {source_id}

        while queue:
            curr_id, path_node_ids, path_rels = queue.popleft()
            if len(path_rels) >= max_depth:
                continue

            rels = self._rel_repo.list_for_entity(
                tenant_id=tenant_id,
                entity_id=curr_id,
                direction="both",
                limit=100,
            )

            for rel in rels:
                nxt_id = rel.target_entity_id if rel.source_entity_id == curr_id else rel.source_entity_id

                if nxt_id == target_id:
                    final_node_ids = path_node_ids + [target_id]
                    final_rels = path_rels + [rel]
                    nodes_objs: list[GraphEntity] = []
                    for nid in final_node_ids:
                        obj = self._entity_repo.get(tenant_id=tenant_id, entity_id=nid)
                        if obj is not None:
                            nodes_objs.append(obj)
                    if len(nodes_objs) == len(final_node_ids):
                        return GraphPath(
                            nodes=tuple(nodes_objs),
                            relationships=tuple(final_rels),
                            depth=len(final_rels),
                        )

                if nxt_id not in visited and len(path_rels) + 1 < max_depth:
                    visited.add(nxt_id)
                    queue.append((nxt_id, path_node_ids + [nxt_id], path_rels + [rel]))

        return None

    def find_related_entities(
        self,
        *,
        tenant_id: uuid.UUID,
        entity_id: uuid.UUID,
        max_depth: int = 2,
        limit: int = 100,
    ) -> list[GraphEntity]:
        """Find all distinct entities reachable within max_depth hops."""
        if not isinstance(tenant_id, uuid.UUID) or not isinstance(entity_id, uuid.UUID):
            raise ValidationException(
                message="IDs must be valid UUIDs",
                code=400,
                data={"field": "id"},
            )

        start_entity = self._entity_repo.get(tenant_id=tenant_id, entity_id=entity_id)
        if start_entity is None:
            raise NotFoundException(
                message=f"entity '{entity_id}' not found",
                code=404,
                data={"entity_id": str(entity_id)},
            )

        max_depth = max(1, min(max_depth, 4))
        visited: set[uuid.UUID] = {entity_id}
        queue: deque[tuple[uuid.UUID, int]] = deque([(entity_id, 0)])
        result_entities: list[GraphEntity] = []

        while queue and len(result_entities) < limit:
            curr_id, depth = queue.popleft()
            if depth >= max_depth:
                continue

            rels = self._rel_repo.list_for_entity(
                tenant_id=tenant_id, entity_id=curr_id, direction="both", limit=50
            )

            for rel in rels:
                nxt_id = rel.target_entity_id if rel.source_entity_id == curr_id else rel.source_entity_id
                if nxt_id not in visited:
                    visited.add(nxt_id)
                    node = self._entity_repo.get(tenant_id=tenant_id, entity_id=nxt_id)
                    if node is not None:
                        result_entities.append(node)
                        if len(result_entities) >= limit:
                            break
                        queue.append((nxt_id, depth + 1))

        return result_entities

    def find_connected_documents(
        self,
        *,
        tenant_id: uuid.UUID,
        entity_id: uuid.UUID,
    ) -> list[uuid.UUID]:
        """Discover parent document IDs connected to this entity via chunk source relationships."""
        stmt = (
            select(KGEntityModel.source_chunk_id)
            .where(
                KGEntityModel.tenant_id == tenant_id,
                KGEntityModel.id == entity_id,
            )
        )
        chunk_id = self._db.execute(stmt).scalar_one_or_none()
        if not chunk_id:
            return []

        from src.ingestion.infrastructure.models import DocumentChunkModel
        doc_stmt = (
            select(DocumentChunkModel.document_id)
            .where(
                DocumentChunkModel.tenant_id == tenant_id,
                DocumentChunkModel.id == chunk_id,
            )
        )
        doc_id = self._db.execute(doc_stmt).scalar_one_or_none()
        return [doc_id] if doc_id else []

    def find_dependencies(
        self,
        *,
        tenant_id: uuid.UUID,
        entity_id: uuid.UUID,
    ) -> list[GraphEntity]:
        """Find entities connected via DEPENDS_ON or USES relationships."""
        deps: list[GraphEntity] = []
        for rel_type in [RelationshipType.DEPENDS_ON, RelationshipType.USES]:
            neighbors = self.find_neighbors(
                tenant_id=tenant_id,
                entity_id=entity_id,
                direction="outgoing",
                relationship_type=rel_type,
            )
            deps.extend(neighbors)

        # Deduplicate
        seen: set[uuid.UUID] = set()
        unique_deps: list[GraphEntity] = []
        for d in deps:
            if d.id not in seen:
                seen.add(d.id)
                unique_deps.append(d)
        return unique_deps


class GraphSearchService:
    """Service providing search capabilities over a tenant's Knowledge Graph."""

    def __init__(self, db: Session) -> None:
        self._db = db
        self._entity_repo = GraphEntityRepository(db)
        self._rel_repo = GraphRelationshipRepository(db)

    def search_entities(
        self,
        *,
        tenant_id: uuid.UUID,
        query: str | None = None,
        entity_type: EntityType | str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[GraphEntity]:
        """Search entities by substring name and/or entity type."""
        return self._entity_repo.search(
            tenant_id=tenant_id,
            query=query,
            entity_type=entity_type,
            limit=limit,
            offset=offset,
        )

    def search_relationships(
        self,
        *,
        tenant_id: uuid.UUID,
        entity_id: uuid.UUID | None = None,
        relationship_type: RelationshipType | str | None = None,
        limit: int = 50,
    ) -> Sequence[GraphRelationship]:
        """List or search relationships for a tenant."""
        if entity_id is not None:
            if isinstance(relationship_type, str):
                try:
                    relationship_type = RelationshipType(relationship_type)
                except ValueError:
                    relationship_type = None
            return self._rel_repo.list_for_entity(
                tenant_id=tenant_id,
                entity_id=entity_id,
                relationship_type=relationship_type,
                limit=limit,
            )

        stmt = (
            select(KGRelationModel)
            .where(KGRelationModel.tenant_id == tenant_id)
            .order_by(KGRelationModel.created_at.desc())
            .limit(limit)
        )
        if relationship_type is not None:
            value = relationship_type.value if isinstance(relationship_type, RelationshipType) else relationship_type
            stmt = stmt.where(KGRelationModel.relationship_type == value)

        models = self._db.execute(stmt).scalars().all()
        from src.knowledge_graph.infrastructure.repositories import _model_to_relation
        return [_model_to_relation(m) for m in models]

    def search_graph(
        self,
        *,
        tenant_id: uuid.UUID,
        query: str,
        entity_type: EntityType | str | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        """Search graph entities and their associated relationships."""
        entities = self.search_entities(
            tenant_id=tenant_id,
            query=query,
            entity_type=entity_type,
            limit=limit,
        )

        all_rels: list[GraphRelationship] = []
        seen_rel_ids: set[uuid.UUID] = set()

        for ent in entities:
            rels = self._rel_repo.list_for_entity(
                tenant_id=tenant_id,
                entity_id=ent.id,
                limit=20,
            )
            for r in rels:
                if r.id not in seen_rel_ids:
                    seen_rel_ids.add(r.id)
                    all_rels.append(r)

        return {
            "entities": list(entities),
            "relationships": all_rels,
        }


__all__ = ["GraphTraversalService", "GraphSearchService"]
