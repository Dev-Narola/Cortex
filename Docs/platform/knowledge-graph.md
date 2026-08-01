# Knowledge Graph Module

V9 Part 4, Task 47.

## Purpose

Per-tenant knowledge graph: entity + relation extraction
from documents, 1-hop and 2-hop traversal, semantic
search over entities. Backed by Postgres (V7); Neo4j is
the forward-compat backend (ADR-0004).

## Architecture

```
knowledge_graph/
├── domain/
│   ├── entities.py        # GraphEntity, GraphRelationship
│   ├── value_objects.py   # EntityType, RelationshipType
│   └── exceptions.py
├── application/
│   ├── command/           # extraction pipeline, security
│   ├── query/             # GraphTraversalService, GraphSearchService
│   └── observability.py   # OTel spans
├── infrastructure/
│   ├── models.py
│   ├── repositories.py
│   ├── graph_database.py  # GraphDatabaseClient ABC
│   ├── session.py         # Neo4jSessionManager (forward-compat)
│   ├── workers.py         # graph_extraction_task
│   └── worker.py          # Arq WorkerSettings
└── interface/
    ├── rest/              # /graph/extract, /graph/entities
    └── graphql/           # Strawberry schema
```

## Public interfaces

* `POST /api/v1/graph/extract` — owner / admin only
* `GET /api/v1/graph/entities`
* `GET /api/v1/graph/relations`
* `GET /api/v1/graph/neighbors/{id}`
* GraphQL: `entity(id)`, `entities(name)`, `neighbors(id)`,
  `searchEntities(query)`, `extractGraph(documentId)`

## Configuration

| Key | Default | Description |
| --- | --- | --- |
| `NEO4J_URL` | (empty) | Forward-compat Neo4j URL |
| `NEO4J_USERNAME` | (empty) | Forward-compat Neo4j user |
| `NEO4J_PASSWORD` | (empty) | Forward-compat Neo4j password |
| `NEO4J_POOL_SIZE` | 50 | Forward-compat Neo4j pool size |
| `LLM_PROVIDER` | openai | Extraction LLM provider |
| `LLM_MODEL` | gpt-4o-mini | Extraction LLM model |

## Dependencies

* `sqlalchemy`, `asyncpg` — primary storage
* `openai` — LLM for extraction
* `strawberry-graphql` — GraphQL surface
* `arq` — background extraction

## Extension points

* New extraction provider: implement
  `knowledge_graph.domain.interfaces.ExtractionProvider`
  and register it in `core/dependencies.py`.
* New entity / relationship types: extend the `Enum`s in
  `value_objects.py`.
* Switch to Neo4j: implement
  `Neo4jSessionManager` and `GraphTransactionManager`
  (the V7 forward-compat seam).
