"""
GraphQL schema definition for Knowledge Graph operations.
"""

from __future__ import annotations

import strawberry
from strawberry.fastapi import GraphQLRouter

from src.knowledge_graph.interface.graphql.resolvers import (
    GraphEntityGraphQL,
    GraphPathGraphQL,
    RelationshipGraphQL,
    _get_kg_context,
    mutate_create_entity,
    mutate_create_relationship,
    mutate_delete_entity,
    resolve_entities,
    resolve_entity,
    resolve_neighbors,
    resolve_path,
    resolve_related_entities,
    resolve_relationships,
)


@strawberry.type
class Query:
    entity: GraphEntityGraphQL | None = strawberry.field(resolver=resolve_entity)
    entities: list[GraphEntityGraphQL] = strawberry.field(resolver=resolve_entities)
    relationships: list[RelationshipGraphQL] = strawberry.field(resolver=resolve_relationships)
    neighbors: list[GraphEntityGraphQL] = strawberry.field(resolver=resolve_neighbors)
    path: GraphPathGraphQL | None = strawberry.field(resolver=resolve_path)
    related_entities: list[GraphEntityGraphQL] = strawberry.field(resolver=resolve_related_entities)


@strawberry.type
class Mutation:
    create_entity: GraphEntityGraphQL = strawberry.mutation(resolver=mutate_create_entity)
    delete_entity: bool = strawberry.mutation(resolver=mutate_delete_entity)
    create_relationship: RelationshipGraphQL = strawberry.mutation(resolver=mutate_create_relationship)


schema = strawberry.Schema(query=Query, mutation=Mutation)
# ``context_getter`` wires the FastAPI request-scoped
# database session (from :func:`src.core.database.get_db`)
# into the GraphQL context. Tests override ``get_db``
# via ``app.dependency_overrides``; the resolvers see
# the override because the request goes through the
# FastAPI dependency system.
graphql_router = GraphQLRouter(schema, context_getter=_get_kg_context)

__all__ = ["schema", "graphql_router", "Query", "Mutation"]
