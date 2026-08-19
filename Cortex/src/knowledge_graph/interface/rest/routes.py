"""
REST API endpoints for the Knowledge Graph bounded context.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.core.dependencies import get_current_tenant, get_current_user, require_member
from src.identity.domain.entities import Tenant, User
from src.knowledge_graph.application.extraction import (
    EntityExtractionService,
    GraphExtractionPipeline,
    OpenAIExtractionProvider,
    RelationshipExtractionService,
)
from src.knowledge_graph.application.security import require_extraction_role
from src.knowledge_graph.application.query.traversal import (
    GraphSearchService,
    GraphTraversalService,
)
from src.knowledge_graph.domain.value_objects import EntityType, RelationshipType
from src.knowledge_graph.infrastructure.repositories import (
    GraphEntityRepository,
    GraphRelationshipRepository,
)
from src.shared.exceptions import NotFoundException, ValidationException

router = APIRouter(prefix="/graph", tags=["Knowledge Graph"])


@router.post("/extract/{document_id}", status_code=status.HTTP_200_OK)
async def extract_document_graph(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current=Depends(get_current_user),
) -> dict[str, Any]:
    """Trigger Knowledge Graph extraction on an ingested document.

    The spec's Rule 2 (Phase 10) restricts the
    trigger to ``owner`` and ``admin`` roles.
    The check is the
    :func:`require_extraction_role` helper from
    :mod:`src.knowledge_graph.application.security`
    — the helper raises 403 (cross-tenant) or
    403 (role violation) before the LLM call
    fires, so a forbidden request never spends
    an OpenAI token.
    """
    user: User = current[0]
    tenant: Tenant = current[1]
    require_extraction_role(user, target_tenant_id=tenant.id)

    provider = OpenAIExtractionProvider()
    entity_svc = EntityExtractionService(provider)
    rel_svc = RelationshipExtractionService(provider)
    pipeline = GraphExtractionPipeline(
        db=db,
        entity_service=entity_svc,
        relationship_service=rel_svc,
    )

    result = await pipeline.extract_for_document(
        tenant_id=tenant.id,
        document_id=document_id,
    )

    return {
        "document_id": str(result.document_id),
        "tenant_id": str(result.tenant_id),
        "entities_count": len(result.entities),
        "relationships_count": len(result.relationships),
        "metrics": result.metrics.as_dict(),
    }


@router.get("/entities")
def list_entities(
    query: str | None = None,
    type: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """List and search entities with optional filters."""
    search_svc = GraphSearchService(db)
    etype = EntityType(type) if type else None
    entities = search_svc.search_entities(
        tenant_id=tenant.id,
        query=query,
        entity_type=etype,
        limit=limit,
        offset=offset,
    )

    entity_repo = GraphEntityRepository(db)
    total = entity_repo.count(tenant_id=tenant.id, query=query, entity_type=etype)

    return {
        "items": [
            {
                "id": str(e.id),
                "tenant_id": str(e.tenant_id),
                "name": e.name,
                "entity_type": e.entity_type.value if hasattr(e.entity_type, "value") else str(e.entity_type),
                "description": e.description,
                "properties": e.properties,
                "canonical_id": str(e.canonical_id) if e.canonical_id else None,
                "source_chunk_id": str(e.source_chunk_id) if e.source_chunk_id else None,
                "created_at": e.created_at.isoformat(),
            }
            for e in entities
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/entities/{entity_id}")
def get_entity(
    entity_id: uuid.UUID,
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Get entity by ID."""
    repo = GraphEntityRepository(db)
    entity = repo.get(tenant_id=tenant.id, entity_id=entity_id)
    if entity is None:
        raise NotFoundException(
            message=f"entity '{entity_id}' not found",
            code=404,
            data={"entity_id": str(entity_id)},
        )

    return {
        "id": str(entity.id),
        "tenant_id": str(entity.tenant_id),
        "name": entity.name,
        "entity_type": entity.entity_type.value if hasattr(entity.entity_type, "value") else str(entity.entity_type),
        "description": entity.description,
        "properties": entity.properties,
        "canonical_id": str(entity.canonical_id) if entity.canonical_id else None,
        "source_chunk_id": str(entity.source_chunk_id) if entity.source_chunk_id else None,
        "created_at": entity.created_at.isoformat(),
        "updated_at": entity.updated_at.isoformat(),
    }


@router.get("/relationships")
def list_relationships(
    entity_id: uuid.UUID | None = None,
    type: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """List relationships for a tenant or specific entity."""
    search_svc = GraphSearchService(db)
    rtype = RelationshipType(type) if type else None
    rels = search_svc.search_relationships(
        tenant_id=tenant.id,
        entity_id=entity_id,
        relationship_type=rtype,
        limit=limit,
    )

    return {
        "items": [
            {
                "id": str(r.id),
                "tenant_id": str(r.tenant_id),
                "source_entity_id": str(r.source_entity_id),
                "target_entity_id": str(r.target_entity_id),
                "relationship_type": r.relationship_type.value if hasattr(r.relationship_type, "value") else str(r.relationship_type),
                "confidence": r.confidence,
                "properties": r.properties,
                "source_chunk_id": str(r.source_chunk_id) if r.source_chunk_id else None,
                "created_at": r.created_at.isoformat(),
            }
            for r in rels
        ],
        "limit": limit,
    }


@router.get("/entities/{entity_id}/neighbors")
def get_entity_neighbors(
    entity_id: uuid.UUID,
    direction: str = "both",
    type: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Get adjacent neighbor entities for a given start entity."""
    traversal_svc = GraphTraversalService(db)
    rtype = RelationshipType(type) if type else None
    neighbors = traversal_svc.find_neighbors(
        tenant_id=tenant.id,
        entity_id=entity_id,
        direction=direction,
        relationship_type=rtype,
        limit=limit,
    )

    return {
        "entity_id": str(entity_id),
        "neighbors": [
            {
                "id": str(n.id),
                "name": n.name,
                "entity_type": n.entity_type.value if hasattr(n.entity_type, "value") else str(n.entity_type),
                "description": n.description,
                "canonical_id": str(n.canonical_id) if n.canonical_id else None,
                "source_chunk_id": str(n.source_chunk_id) if n.source_chunk_id else None,
            }
            for n in neighbors
        ],
    }


@router.get("/path")
def get_shortest_path(
    source: uuid.UUID,
    target: uuid.UUID,
    max_depth: int = Query(default=3, ge=1, le=5),
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Find shortest path between source and target entities."""
    traversal_svc = GraphTraversalService(db)
    path = traversal_svc.find_shortest_path(
        tenant_id=tenant.id,
        source_id=source,
        target_id=target,
        max_depth=max_depth,
    )

    if not path:
        raise NotFoundException(
            message=f"No path found between {source} and {target}",
            code=404,
            data={"source": str(source), "target": str(target)},
        )

    return path.to_dict()


@router.get("/search")
def search_graph(
    query: str,
    type: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Search graph nodes and relationships."""
    search_svc = GraphSearchService(db)
    etype = EntityType(type) if type else None
    res = search_svc.search_graph(
        tenant_id=tenant.id,
        query=query,
        entity_type=etype,
        limit=limit,
    )

    return {
        "query": query,
        "entities": [
            {
                "id": str(e.id),
                "name": e.name,
                "entity_type": e.entity_type.value if hasattr(e.entity_type, "value") else str(e.entity_type),
                "description": e.description,
                "canonical_id": str(e.canonical_id) if e.canonical_id else None,
                "source_chunk_id": str(e.source_chunk_id) if e.source_chunk_id else None,
            }
            for e in res["entities"]
        ],
        "relationships": [
            {
                "id": str(r.id),
                "source_entity_id": str(r.source_entity_id),
                "target_entity_id": str(r.target_entity_id),
                "relationship_type": r.relationship_type.value if hasattr(r.relationship_type, "value") else str(r.relationship_type),
                "confidence": r.confidence,
                "source_chunk_id": str(r.source_chunk_id) if r.source_chunk_id else None,
            }
            for r in res["relationships"]
        ],
    }


__all__ = ["router"]

