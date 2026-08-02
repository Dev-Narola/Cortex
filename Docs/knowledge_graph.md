# V7 — Knowledge Graph (developer guide)

This document is the developer reference for the
V7 Knowledge Graph subsystem. It covers the
architecture, the data flow, the public APIs, the
extraction pipeline, and the operational
checklists.

The Knowledge Graph is one of three retrieval
sources in Cortex. The other two are the
vector store (pgvector) and the keyword search
(Postgres FTS). The graph adds **structured
facts** — entities and the typed relationships
between them — that the vector hits cannot
provide on their own.

```
                    User
                      │
                      ▼
                Agent Layer
                      │
                      ▼
        ┌───────────────────────────┐
        │   Context Intelligence    │
        │                           │
        │  ┌─────────────────────┐  │
        │  │ Vector Retrieval    │  │
        │  └─────────────────────┘  │
        │  ┌─────────────────────┐  │
        │  │ Knowledge Graph     │  │   ◀── this document
        │  └─────────────────────┘  │
        │  ┌─────────────────────┐  │
        │  │ Document Memory     │  │
        │  └─────────────────────┘  │
        └───────────────────────────┘
                      │
                      ▼
                    LLM
```

---

## 1. Architecture

The KG lives in the `src/knowledge_graph/` and
`src/graph_retrieval/` packages. The directory
shape (per the V7 Part 3 spec):

```
src/knowledge_graph/
  domain/
    entities.py         # GraphEntity, GraphRelationship
    value_objects.py    # EntityType, RelationshipType, GraphPath
    exceptions.py       # EntityNotFound, ...
  application/
    extraction.py       # EntityExtractionService, RelationshipExtractionService,
                        # GraphExtractionPipeline, ExtractionProvider seam
    traversal.py        # GraphTraversalService, GraphSearchService
    security.py         # GraphSecurityPolicy (Phase 10 defense-in-depth)
    observability.py    # OTel spans + metrics helpers
  infrastructure/
    models.py           # KGEntityModel, KGRelationModel (SQLAlchemy)
    repositories.py     # GraphEntityRepository, GraphRelationshipRepository
    graph_database.py   # GraphDatabaseClient ABC + Postgres impl
    session.py          # Neo4jSessionManager + GraphTransactionManager
    workers.py          # graph_extraction_task + enqueue helper
    worker.py           # Arq WorkerSettings entry point
    indexes.cypher      # forward-compat Neo4j index script
  interface/
    graphql/
      schema.py
      resolvers.py
    rest/
      routes.py

src/graph_retrieval/
  application/
    services.py         # GraphRetrievalService (legacy + new fused path)
    fusion.py           # GraphVectorFusionService (Phase 9)
    context_builder.py  # GraphContextBuilder (Phase 9)
```

The layering is strict: the `domain` layer
imports nothing from infrastructure; the
`application` layer imports domain types only;
the `infrastructure` and `interface` layers are
the only ones that touch SQLAlchemy, FastAPI, or
Arq.

---

## 2. Data model

The KG is stored in two Postgres tables that
mirror the V1+V3 doc's design:

* `kg_entities` — one row per real-world thing.
  Columns: `id`, `tenant_id`, `name`,
  `entity_type`, `description`, `properties`
  (JSONB), `canonical_id` (self-FK for merges),
  `source_chunk_id` (FK to `document_chunks`),
  `created_at`, `updated_at`.
* `kg_relations` — one row per typed edge.
  Columns: `id`, `tenant_id`, `source_entity_id`,
  `target_entity_id`, `relationship_type`,
  `properties` (JSONB), `confidence`,
  `source_chunk_id` (FK to `document_chunks`),
  `created_at`.

Uniqueness is enforced at the database layer:

* `kg_entities` has a unique constraint on
  `(tenant_id, name, entity_type)` — a tenant
  cannot have two "Acme Corp" entities of the
  same type.
* `kg_relations` has a unique constraint on
  `(source_entity_id, target_entity_id,
  relationship_type)` — the same edge cannot
  appear twice.

The migration is in
`alembic/versions/v7_create_knowledge_graph.py`
and is the only migration needed for the KG
schema.

### Indexes

The Postgres indexes are declared inline on the
ORM models. The forward-compat Cypher script in
`infrastructure/indexes.cypher` documents the
Neo4j equivalent. A tenant-scoped query on a
hot path (e.g. "list this tenant's neighbours")
uses the `kg_entities_tenant_id` B-tree and the
`ix_kg_relations_source_target` composite.

---

## 3. Data flow

The end-to-end flow of a graph extraction:

```
   ┌─────────────────┐
   │  Ingestion      │  Document embedded, chunks persisted.
   │  worker         │
   └────────┬────────┘
            │  enqueue_graph_extraction(doc, tenant)
            ▼
   ┌─────────────────┐
   │  KG worker      │  Arq task: graph_extraction_task
   │  (its own queue) │
   └────────┬────────┘
            │  GraphExtractionPipeline.extract_for_document
            ▼
   ┌────────────────────────────────────────────┐
   │  GraphExtractionPipeline                    │
   │  for each chunk:                            │
   │    EntityExtractionService.extract_entities │
   │    → EntityExtractionProvider (LLM)         │
   │    RelationshipExtractionService.            │
   │      extract_relationships                  │
   │    → EntityExtractionProvider (LLM)         │
   │    dedup (canonical_id)                      │
   │    persist (repos)                          │
   └────────┬───────────────────────────────────┘
            │  rows in kg_entities, kg_relations
            ▼
   ┌─────────────────┐
   │  Graph DB       │  Postgres (current) / Neo4j (forward-compat)
   └─────────────────┘
```

Once a document is graph-extracted, the
**retrieval** flow is:

```
   User question
        │
        ▼
   GraphRetrievalService.retrieve_fused
        │
        ├──► GraphSearchService.search_entities
        ├──► GraphRetrievalService.retrieve_relationships
        │
        ▼
   GraphVectorFusionService.fuse
        │
        ├──► GraphContextBuilder.render
        │
        ▼
   Pre-rendered context_text
        │
        ▼
   LLM prompt
```

The V6 agent executor wires this in as
`_augment_with_graph_context` — every agent
run gets a graph-augmented user message.

---

## 4. APIs

### 4.1 REST (`/api/v1/graph/...`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/graph/extract/{document_id}` | Trigger graph extraction (owner/admin only) |
| `GET`  | `/graph/entities` | List entities (filter by `type`, `name` substring, paginated) |
| `GET`  | `/graph/entities/{id}` | Get one entity |
| `GET`  | `/graph/relationships` | List relationships (filter by `entity_id`, `type`) |
| `GET`  | `/graph/entities/{id}/neighbors` | Direct neighbours |
| `GET`  | `/graph/path?source=&target=&max_depth=` | Shortest path (depth-bounded BFS) |
| `GET`  | `/graph/search?query=&type=` | Substring search across entities and their edges |

Every endpoint is tenant-scoped via the JWT
bearer token in the `Authorization` header. The
`POST /graph/extract` endpoint additionally
requires the caller to be `owner` or `admin`
(Phase 10 Rule 2).

### 4.2 GraphQL (`/graphql`)

The same surface as REST, exposed via strawberry.
The schema is in
`interface/graphql/schema.py`; the resolvers in
`interface/graphql/resolvers.py` are
tenant-scoped (Phase 10 Rule 3). The GraphQL
context pulls the request-scoped database
session from FastAPI's dependency-injection
system, so any `app.dependency_overrides[get_db]`
in the test suite is honoured.

Queries:

* `entity(id: UUID!) → GraphEntity`
* `entities(query: String, entityType: String,
  limit: Int = 50, offset: Int = 0) → [GraphEntity!]!`
* `relationships(entityId: UUID, type: String,
  limit: Int = 50) → [Relationship!]!`
* `neighbors(id: UUID!, direction: String = "both",
  type: String, limit: Int = 50) → [GraphEntity!]!`
* `path(sourceId: UUID!, targetId: UUID!,
  maxDepth: Int = 3) → GraphPath`
* `relatedEntities(id: UUID!, depth: Int = 2,
  limit: Int = 50) → [GraphEntity!]!`

Mutations:

* `createEntity(name: String!, entityType: String!,
  description: String = "",
  propertiesJson: String) → GraphEntity!`
* `deleteEntity(id: UUID!) → Boolean!`
* `createRelationship(sourceEntityId: UUID!,
  targetEntityId: UUID!, relationshipType: String!,
  confidence: Float = 1.0,
  propertiesJson: String) → Relationship!`

### 4.3 Internal services

The application layer is what a future internal
caller (e.g. a backfill CLI) uses:

```python
from src.knowledge_graph.application.extraction import (
    EntityExtractionService,
    GraphExtractionPipeline,
    OpenAIExtractionProvider,
    RelationshipExtractionService,
)
from src.knowledge_graph.application.traversal import (
    GraphTraversalService,
    GraphSearchService,
)
from src.knowledge_graph.application.security import (
    GraphSecurityPolicy,
    require_extraction_role,
)
```

The `RuleBasedExtractionProvider` is the
offline / test path — no LLM call, deterministic.
Use it in unit tests and in local development
when you don't have an OpenAI key.

---

## 5. Extraction pipeline

### 5.1 The provider seam

`ExtractionProvider` is the abstract seam:

```python
class ExtractionProvider(ABC):
    @abstractmethod
    async def extract_entities(self, text: str) -> list[EntityCandidate]: ...
    @abstractmethod
    async def extract_relationships(self, text, entities) -> list[RelationshipCandidate]: ...
```

Two concrete implementations:

* `OpenAIExtractionProvider` — production. Uses
  the project's `LLMProvider` (currently
  OpenAI), JSON-mode system prompts, low
  temperature (0.0) for deterministic extraction.
* `RuleBasedExtractionProvider` — offline
  fallback. Capitalised-token heuristic; no
  LLM.

### 5.2 Confidence threshold

`RelationshipExtractionService` filters out
edges with `confidence < 0.80` (the spec's
recommendation). The threshold is configurable
on the service constructor. The pipeline
applies a *second* filter on the relationship
confidence as a final safety net.

### 5.3 Idempotency

The pipeline's dedup pass is keyed on
`(tenant_id, name, entity_type)` for entities
and `(source_entity_id, target_entity_id,
relationship_type)` for relationships. Re-running
an extraction is safe — it never produces
duplicate rows.

### 5.4 Async path

The `POST /graph/extract/{document_id}` endpoint
runs the pipeline synchronously (await inside
FastAPI). The async production path is the
**Arq worker** (see Phase 8):

* The ingestion worker calls
  `enqueue_graph_extraction(...)` once a
  document reaches `indexed` state.
* The KG worker (`WorkerSettings` in
  `infrastructure/worker.py`) consumes the
  job, opens a `Neo4jSessionManager` transaction,
  and runs the pipeline inside it.

Run the KG worker as a separate process:

```bash
python -m arq src.knowledge_graph.infrastructure.worker.WorkerSettings
```

---

## 6. Security

The KG is locked down at three layers
(Phase 10 spec):

1. **Repository layer.** Every method takes
   `tenant_id` and scopes the SQL by it. A
   caller that passes the wrong tenant id gets a
   404 ("not found"), not a 403 — the row is not
   visible, by design.
2. **Application layer (`GraphSecurityPolicy`).
   Defence-in-depth check for routes that
   accept a `target_tenant_id` parameter. The
   policy raises `ForbiddenException` (403) on
   cross-tenant access.
3. **Role check.** `POST /graph/extract` requires
   `owner` or `admin`. The check is
   `require_extraction_role(user, target_tenant_id=...)`
   in `application/security.py`.

GraphQL resolvers read `info.context.db` (the
request-scoped SQLAlchemy session) and apply
`current_user.tenant_id` on every read. The
context-getter wires the FastAPI-injected
session through strawberry, so test
dependency-oversrides work as expected.

---

## 7. Observability

### 7.1 Metrics

The KG adds 10 metrics to the V4 Prometheus
registry (see `observability/infrastructure/metrics.py`):

| Metric | Type | Labels |
|--------|------|--------|
| `cortex_kg_entities_extracted_total` | counter | — |
| `cortex_kg_relationships_extracted_total` | counter | — |
| `cortex_kg_extraction_failures_total` | counter | — |
| `cortex_kg_pipeline_runs_total` | counter | — |
| `cortex_graph_queries_total` | counter | — |
| `cortex_graph_traversal_duration_seconds` | histogram | — |
| `cortex_graph_retrieval_duration_seconds` | histogram | — |
| `cortex_graph_llm_extraction_tokens_total` | counter | — |
| `cortex_graph_extraction_duration_seconds` | histogram | `outcome` |
| `cortex_graph_traversal_depth` | histogram | `algorithm` |

The label discipline follows V4 — `tenant_id`
is *not* a label (cardinality is unbounded; per-
tenant counters live in `usage_events`).

### 7.2 Tracing

The KG opens OTel spans following the OTel
GenAI convention:

```
extract_graph <document_id>           (root)
  ├── extract_entities <chunk_id>
  ├── extract_relationships <chunk_id>
  └── save_graph <chunk_id>
```

Plus `graph_traversal <algorithm>` and
`graph_retrieval` for the read paths. The
helpers live in `application/observability.py`
and are no-ops when OTel is not configured.

---

## 8. Troubleshooting

### 8.1 The extraction is empty

* Check `cortex_kg_extraction_failures_total` —
  most empty runs are LLM failures, not silent
  pipelines.
* Run a chunk through `RuleBasedExtractionProvider`
  to confirm the chunk has capitalised tokens.
  If the rule-based provider returns 0 entities,
  the chunk is too short or too noisy.
* Check `OPENAI_API_KEY` and the OpenAI rate
  limit; transient 429s raise
  `GraphExtractionFailed` which is logged at
  WARNING and surfaced in the
  `graph_extraction.entity_failed` log line.

### 8.2 Cross-tenant data appears in a search

* Confirm the caller is sending the right JWT.
  The token's `tenant_id` claim is the
  authoritative scope.
* Check the repository method — every method
  takes `tenant_id` and scopes by it. A method
  that doesn't is a bug.
* The GraphQL context uses
  `info.context.db` (the request-scoped
  session). If a custom resolver ignores this
  and opens a fresh `SessionLocal()`, the
  resolver will see a different session than
  the test override — fix the resolver to use
  `info.context.db`.

### 8.3 The graph worker is stuck

* Check the Arq Redis health: `redis-cli ping`.
  The worker is best-effort: a Redis outage
  does not break the ingestion path (the enqueue
  fails silently with a warning).
* Check the worker's `max_jobs` and `job_timeout`
  in `infrastructure/worker.py` — a stuck
  extraction can hold a worker for up to
  10 minutes.

### 8.4 Performance

The hot paths are:

* `kg_entities_tenant_id` B-tree — every
  repository method uses it.
* `ix_kg_relations_source_target` composite —
  the BFS traversal walks it repeatedly.
* `entity_name` index + the ILIKE query — used
  by the search endpoint.

If a tenant grows past 100k entities / 500k
edges, the Part 3 forward-compat `Neo4j` path
is the migration target. See
`infrastructure/indexes.cypher` for the
Neo4j-side indexes.

---

## 9. Forward-compat: the Neo4j seam

The current production path is **Postgres +
SQLAlchemy**. The V1+V3 doc and the V7 Part 1
architecture decision chose this because the
per-tenant graph is small (the median tenant
has < 100k nodes and < 500k edges) and
Postgres + recursive CTEs covers every graph
query the spec calls for.

The forward-compat path is:

* `GraphDatabaseClient` is the abstract
  interface; `PostgresGraphDatabaseClient` is
  the current implementation. A future
  `Neo4jGraphDatabaseClient` drops in here.
* `Neo4jSessionManager` is named for the spec
  but delegates to SQLAlchemy. A future
  Neo4j-aware subclass opens the driver.
* `infrastructure/indexes.cypher` is the
  forward-compat Neo4j index script. A future
  deployment runs this once at cluster
  bring-up.

When swapping to Neo4j:

1. Set `GRAPH_BACKEND=neo4j` in `.env`.
2. Implement `Neo4jGraphDatabaseClient` against
   the real driver.
3. Run the Cypher in `indexes.cypher`.
4. The repositories, services, REST and GraphQL
   layers do not change.

---

## 10. Tests

The V7 test surface:

* `tests/unit/knowledge_graph/domain/` — domain
  invariants (8 tests).
* `tests/unit/knowledge_graph/infrastructure/` —
  repos + session manager (12 tests).
* `tests/unit/knowledge_graph/application/` —
  extraction, traversal, security (32 tests).
* `tests/unit/knowledge_graph/interface/` — REST
  + GraphQL (10 tests).
* `tests/unit/graph_retrieval/application/` —
  fusion + context builder (13 tests).
* `tests/integration/knowledge_graph/` —
  end-to-end multi-tenant isolation (1 test).

Run the full suite:

```bash
pytest tests/unit tests/integration --no-cov
```
