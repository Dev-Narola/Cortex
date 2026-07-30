"""
GraphQL resolvers for the Knowledge Graph bounded context.

All resolvers are authenticated, validated, and strictly tenant-scoped.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import strawberry
from fastapi import Depends
from sqlalchemy.orm import Session
from strawberry.fastapi import BaseContext
from strawberry.types import Info

from src.core.database import SessionLocal, get_db
from src.core.dependencies import _bearer_token, _resolve_jwt_user
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
from src.shared.exceptions import NotFoundException, UnauthorizedException, ValidationException


class KGGraphQLContext(BaseContext):
    """The GraphQL request context.

    Carries the request-scoped database session and the
    request object. The session comes from the FastAPI
    ``get_db`` dependency, so it inherits any
    ``app.dependency_overrides[get_db]`` registered by
    the tests — the resolvers do not open their own
    connections.
    """

    def __init__(self, db: Session) -> None:
        super().__init__()
        self.db = db


async def _get_kg_context(db: Session = Depends(get_db)) -> KGGraphQLContext:
    """The strawberry ``context_getter``.

    Wired in :mod:`src.knowledge_graph.interface.graphql.schema`
    so the resolvers see the FastAPI request-scoped
    session and any dependency overrides.
    """
    return KGGraphQLContext(db=db)


def _get_tenant_id_from_info(info: Info) -> uuid.UUID:
    """Extract and validate tenant_id from the GraphQL request authentication header.

    The tenant is resolved by:

    1. Decoding the JWT bearer token (raises 401 on
       failure).
    2. Loading the user + tenant rows via the
       request-scoped session.
    3. Checking both are active.

    The session is ``info.context.db`` — the same
    session the rest of the resolver uses — so the
    identity lookup shares the request's transaction.
    A fallback to a fresh ``SessionLocal()`` exists for
    contexts that do not carry a session (e.g. when the
    context_getter is not wired); in that case the
    session is opened and closed locally.
    """
    request = info.context.request if hasattr(info.context, "request") else None
    if request is None:
        request = info.context.get("request") if hasattr(info.context, "get") else None
    if request is None:
        raise UnauthorizedException(message="Authentication required", code=401)

    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise UnauthorizedException(message="Missing Authorization header", code=401)

    token = _bearer_token(auth_header)

    db = getattr(info.context, "db", None)
    if db is None:
        # No request-scoped session — fall back to a
        # one-shot lookup. This path is the legacy
        # shape and stays in place so the resolvers
        # still work if the context_getter is ever
        # removed.
        db = SessionLocal()
        try:
            user, tenant = _resolve_jwt_user(token, db)
            return tenant.id
        finally:
            db.close()
    user, tenant = _resolve_jwt_user(token, db)
    return tenant.id


@strawberry.type
class GraphEntityGraphQL:
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    entity_type: str
    description: str
    properties_json: str
    created_at: str
    updated_at: str

    @classmethod
    def from_domain(cls, entity: GraphEntity) -> GraphEntityGraphQL:
        return cls(
            id=entity.id,
            tenant_id=entity.tenant_id,
            name=entity.name,
            entity_type=entity.entity_type.value if hasattr(entity.entity_type, "value") else str(entity.entity_type),
            description=entity.description,
            properties_json=json.dumps(entity.properties or {}),
            created_at=entity.created_at.isoformat(),
            updated_at=entity.updated_at.isoformat(),
        )


@strawberry.type
class RelationshipGraphQL:
    id: uuid.UUID
    tenant_id: uuid.UUID
    source_entity_id: uuid.UUID
    target_entity_id: uuid.UUID
    relationship_type: str
    confidence: float
    properties_json: str
    created_at: str

    @classmethod
    def from_domain(cls, rel: GraphRelationship) -> RelationshipGraphQL:
        return cls(
            id=rel.id,
            tenant_id=rel.tenant_id,
            source_entity_id=rel.source_entity_id,
            target_entity_id=rel.target_entity_id,
            relationship_type=rel.relationship_type.value if hasattr(rel.relationship_type, "value") else str(rel.relationship_type),
            confidence=rel.confidence,
            properties_json=json.dumps(rel.properties or {}),
            created_at=rel.created_at.isoformat(),
        )


@strawberry.type
class GraphPathGraphQL:
    nodes: list[GraphEntityGraphQL]
    relationships: list[RelationshipGraphQL]
    depth: int


async def resolve_entity(info: Info, id: uuid.UUID) -> GraphEntityGraphQL | None:
    tenant_id = _get_tenant_id_from_info(info)
    db = info.context.db
    try:
        repo = GraphEntityRepository(db)
        entity = repo.get(tenant_id=tenant_id, entity_id=id)
        return GraphEntityGraphQL.from_domain(entity) if entity else None
    finally:
        pass


async def resolve_entities(
    info: Info,
    query: str | None = None,
    entity_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[GraphEntityGraphQL]:
    tenant_id = _get_tenant_id_from_info(info)
    db = info.context.db
    search_svc = GraphSearchService(db)
    etype = EntityType(entity_type) if entity_type else None
    entities = search_svc.search_entities(
        tenant_id=tenant_id,
        query=query,
        entity_type=etype,
        limit=limit,
        offset=offset,
    )
    return [GraphEntityGraphQL.from_domain(e) for e in entities]


async def resolve_relationships(
    info: Info,
    entity_id: uuid.UUID | None = None,
    type: str | None = None,
    limit: int = 50,
) -> list[RelationshipGraphQL]:
    tenant_id = _get_tenant_id_from_info(info)
    db = info.context.db
    search_svc = GraphSearchService(db)
    rtype = RelationshipType(type) if type else None
    rels = search_svc.search_relationships(
        tenant_id=tenant_id,
        entity_id=entity_id,
        relationship_type=rtype,
        limit=limit,
    )
    return [RelationshipGraphQL.from_domain(r) for r in rels]


async def resolve_neighbors(
    info: Info,
    id: uuid.UUID,
    direction: str = "both",
    type: str | None = None,
    limit: int = 50,
) -> list[GraphEntityGraphQL]:
    tenant_id = _get_tenant_id_from_info(info)
    db = info.context.db
    traversal_svc = GraphTraversalService(db)
    rtype = RelationshipType(type) if type else None
    neighbors = traversal_svc.find_neighbors(
        tenant_id=tenant_id,
        entity_id=id,
        direction=direction,
        relationship_type=rtype,
        limit=limit,
    )
    return [GraphEntityGraphQL.from_domain(n) for n in neighbors]


async def resolve_path(
    info: Info,
    source_id: uuid.UUID,
    target_id: uuid.UUID,
    max_depth: int = 3,
) -> GraphPathGraphQL | None:
    tenant_id = _get_tenant_id_from_info(info)
    db = info.context.db
    traversal_svc = GraphTraversalService(db)
    path = traversal_svc.find_shortest_path(
        tenant_id=tenant_id,
        source_id=source_id,
        target_id=target_id,
        max_depth=max_depth,
    )
    if not path:
        return None
    return GraphPathGraphQL(
        nodes=[GraphEntityGraphQL.from_domain(n) for n in path.nodes],
        relationships=[RelationshipGraphQL.from_domain(r) for r in path.relationships],
        depth=path.depth,
    )


async def resolve_related_entities(
    info: Info,
    id: uuid.UUID,
    depth: int = 2,
    limit: int = 50,
) -> list[GraphEntityGraphQL]:
    tenant_id = _get_tenant_id_from_info(info)
    db = info.context.db
    traversal_svc = GraphTraversalService(db)
    entities = traversal_svc.find_related_entities(
        tenant_id=tenant_id,
        entity_id=id,
        max_depth=depth,
        limit=limit,
    )
    return [GraphEntityGraphQL.from_domain(e) for e in entities]


async def mutate_create_entity(
    info: Info,
    name: str,
    entity_type: str,
    description: str = "",
    properties_json: str | None = None,
) -> GraphEntityGraphQL:
    tenant_id = _get_tenant_id_from_info(info)
    db = info.context.db
    try:
        props = json.loads(properties_json) if properties_json else {}
        entity = GraphEntity.create(
            tenant_id=tenant_id,
            name=name,
            entity_type=EntityType(entity_type.lower()),
            description=description,
            properties=props,
        )
        repo = GraphEntityRepository(db)
        created = repo.create(entity)
        db.commit()
        return GraphEntityGraphQL.from_domain(created)
    except Exception:
        db.rollback()
        raise


async def mutate_delete_entity(info: Info, id: uuid.UUID) -> bool:
    tenant_id = _get_tenant_id_from_info(info)
    db = info.context.db
    try:
        repo = GraphEntityRepository(db)
        deleted = repo.delete(tenant_id=tenant_id, entity_id=id)
        db.commit()
        return deleted
    except Exception:
        db.rollback()
        raise


async def mutate_create_relationship(
    info: Info,
    source_entity_id: uuid.UUID,
    target_entity_id: uuid.UUID,
    relationship_type: str,
    confidence: float = 1.0,
    properties_json: str | None = None,
) -> RelationshipGraphQL:
    tenant_id = _get_tenant_id_from_info(info)
    db = info.context.db
    try:
        props = json.loads(properties_json) if properties_json else {}
        rel = GraphRelationship.create(
            tenant_id=tenant_id,
            source_entity_id=source_entity_id,
            target_entity_id=target_entity_id,
            relationship_type=RelationshipType(relationship_type.lower()),
            confidence=confidence,
            properties=props,
        )
        repo = GraphRelationshipRepository(db)
        created = repo.create(rel)
        db.commit()
        return RelationshipGraphQL.from_domain(created)
    except Exception:
        db.rollback()
        raise
