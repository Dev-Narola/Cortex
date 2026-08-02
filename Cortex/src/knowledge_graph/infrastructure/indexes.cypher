// =============================================================================
// V7 — Knowledge Graph Indexes
// =============================================================================
//
// The current production backend is Postgres (see V1+V3 doc and the Part 1
// architecture decision). The Postgres indexes are declared inline on the
// ORM models in ``src/knowledge_graph/infrastructure/models.py``:
//
//   kg_entities:
//     - PK on id
//     - BTREE on tenant_id               (FK index)
//     - BTREE on entity_type
//     - BTREE on canonical_id            (self-FK, merge support)
//     - BTREE on source_chunk_id         (FK to document_chunks)
//     - UNIQUE (tenant_id, name, entity_type) -- "uq_kg_entities_tenant_name_type"
//
//   kg_relations:
//     - PK on id
//     - BTREE on tenant_id               (FK index)
//     - BTREE on source_entity_id, target_entity_id  (composite)
//     - BTREE on relationship_type
//     - UNIQUE (source_entity_id, target_entity_id, relationship_type)
//                                              -- "uq_kg_relations_edge"
//
// Run ``alembic upgrade head`` to create them.
//
// The Cypher below is the forward-compat script for a future Neo4j
// implementation. A future V9 hardening item can switch
// ``GRAPH_BACKEND=neo4j`` in ``.env``; the same connection knobs apply
// (``NEO4J_URL`` / ``NEO4J_USERNAME`` / ``NEO4J_PASSWORD`` /
// ``GRAPH_DATABASE_NAME``).
//
// =============================================================================
// 1. Entity lookup by id -- O(1) point read
// =============================================================================
CREATE INDEX entity_id_index IF NOT EXISTS
FOR (e:Entity)
ON (e.id);

// =============================================================================
// 2. Tenant isolation -- EVERY query is scoped by tenant_id, so this is
//    the hot-path index. Composite with id for the entity+tenant point
//    read pattern.
// =============================================================================
CREATE INDEX entity_tenant_index IF NOT EXISTS
FOR (e:Entity)
ON (e.tenant_id);

CREATE INDEX entity_tenant_id_composite_index IF NOT EXISTS
FOR (e:Entity)
ON (e.tenant_id, e.id);

// =============================================================================
// 3. Entity name search -- used by the extraction dedup path and the
//    REST/GraphQL search endpoint. The Postgres equivalent is
//    ``ilike '%query%'`` on the name column; the Neo4j equivalent
//    uses a full-text index (the ``entity_name_fulltext_index`` below).
// =============================================================================
CREATE INDEX entity_name_index IF NOT EXISTS
FOR (e:Entity)
ON (e.name);

CREATE FULLTEXT INDEX entity_name_fulltext_index IF NOT EXISTS
FOR (e:Entity)
ON (EACH [e.name]);

// =============================================================================
// 4. Entity type filter -- the "list all PERSON entities" query.
// =============================================================================
CREATE INDEX entity_type_index IF NOT EXISTS
FOR (e:Entity)
ON (e.entity_type);

// =============================================================================
// 5. Relationship lookup by id -- O(1) point read.
// =============================================================================
CREATE INDEX relationship_id_index IF NOT EXISTS
FOR ()-[r:RELATIONSHIP]-()
ON (r.id);

// =============================================================================
// 6. Tenant-scoped relationship lookup -- the hot path for
//    "list this tenant's edges".
// =============================================================================
CREATE INDEX relationship_tenant_index IF NOT EXISTS
FOR ()-[r:RELATIONSHIP]-()
ON (r.tenant_id);

// =============================================================================
// 7. Relationship type filter -- the "find all USES edges" query.
// =============================================================================
CREATE INDEX relationship_type_index IF NOT EXISTS
FOR ()-[r:RELATIONSHIP]-()
ON (r.type);

// =============================================================================
// 8. Composite endpoint lookup -- the BFS traversal expands from
//    (source_entity_id, target_entity_id) repeatedly, so a composite
//    index on both endpoints is the hot path.
// =============================================================================
CREATE INDEX relationship_endpoints_index IF NOT EXISTS
FOR ()-[r:RELATIONSHIP]-()
ON (r.source_entity_id, r.target_entity_id);

// =============================================================================
// 9. Source chunk trace -- every entity and every relationship carries
//    a ``source_chunk_id`` back to the document chunk that produced
//    it. The "find all extractions from this chunk" query uses this.
// =============================================================================
CREATE INDEX entity_source_chunk_index IF NOT EXISTS
FOR (e:Entity)
ON (e.source_chunk_id);

CREATE INDEX relationship_source_chunk_index IF NOT EXISTS
FOR ()-[r:RELATIONSHIP]-()
ON (r.source_chunk_id);
