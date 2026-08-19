/**
 * Knowledge Graph — API types.
 *
 * **F6 Part 2.** Mirrors the backend's actual
 * REST contract under `/api/v1/graph/...` (NOT
 * `/kg/...` as the original F0 spec assumed —
 * the Cortex backend mounts the KG router at
 * `/graph`).
 *
 * **Source of truth.** The backend's
 * ``/openapi.json`` is the authoritative
 * definition; these types are the hand-written
 * mirror we maintain in the frontend until the
 * codegen pipeline (Task 3 of the F6 spec) catches
 * up. Drift is mitigated by:
 *   1. The contract test (`kg-api.test.ts`) which
 *      hits the live backend and asserts the
 *      response shape.
 *   2. The adapter layer that maps API → rendering
 *      types, so a backend change can't silently
 *      leak into the Three.js code.
 *
 * **Strict + narrow.** Each field is explicitly
 * typed (no `any`). Optional fields are
 * ``field: T | null`` rather than ``field?: T``
 * so the contract test can assert on nullability.
 *
 * **No "any of":** if the backend adds a new field,
 * add it here. The compiler + the contract test
 * will tell you what broke.
 */

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

/**
 * A single KG entity (a node). The backend's
 * ``GET /api/v1/graph/entities`` and
 * ``GET /api/v1/graph/entities/{id}`` return this
 * shape (with `updated_at` only on the detail
 * endpoint).
 */
export interface KGEntity {
  /** Backend UUID. The frontend's primary key
   *  for navigation + cache lookup. */
  id: string
  /** Tenant UUID. Never used for routing — the
   *  backend enforces tenant scope at the SQL
   *  level. */
  tenant_id: string
  /** Display name. */
  name: string
  /** Entity type. The backend stores it as a
   *  string (so a new enum value doesn't need a
   *  column migration). The frontend treats it
   *  as a free-form string for rendering
   *  decisions; new types are picked up
   *  automatically. */
  entity_type: string
  /** Short human-readable description. */
  description: string
  /** Free-form properties the extractor chose
   *  to record. JSON-serialisable. */
  properties: Record<string, unknown>
  /** The "merge" primitive. A non-null value
   *  means "this row is a duplicate; the
   *  user-facing entity lives at
   *  ``canonical_id``". The frontend treats the
   *  canonical row as primary and the duplicate
   *  rows as bookkeeping. */
  canonical_id: string | null
  /** **F6 source traceability.** The chunk the
   *  entity was extracted from. The frontend
   *  uses this to navigate the user from an
   *  entity to the source document. ``null``
   *  for manually-created entities or after the
   *  source chunk was deleted (the FK is
   *  ``SET NULL``). */
  source_chunk_id: string | null
  created_at: string
  /** Only present on the detail endpoint. */
  updated_at?: string
}

// ---------------------------------------------------------------------------
// Relationship
// ---------------------------------------------------------------------------

/**
 * A single KG relationship (a directed edge).
 * The backend's ``GET /api/v1/graph/relationships``
 * returns this shape.
 */
export interface KGRelationship {
  id: string
  tenant_id: string
  source_entity_id: string
  target_entity_id: string
  relationship_type: string
  /** LLM confidence in this assertion. ``0..1``. */
  confidence: number
  properties: Record<string, unknown>
  /** **F6 source traceability.** The chunk the
   *  edge was extracted from. */
  source_chunk_id: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// List endpoints
// ---------------------------------------------------------------------------

/**
 * Paginated entity list envelope.
 * ``GET /api/v1/graph/entities?query=&type=&limit=&offset=``
 */
export interface KGEntityListResponse {
  items: KGEntity[]
  total: number
  limit: number
  offset: number
}

/**
 * Relationship list envelope.
 * ``GET /api/v1/graph/relationships?entity_id=&type=&limit=``
 */
export interface KGRelationshipListResponse {
  items: KGRelationship[]
  limit: number
}

// ---------------------------------------------------------------------------
// Neighbors
// ---------------------------------------------------------------------------

/**
 * Neighbor response.
 * ``GET /api/v1/graph/entities/{id}/neighbors``
 * Returns just the adjacent entity summaries
 * (not the relationships themselves) — to
 * render the graph, the frontend also needs to
 * fetch the relationships via the
 * ``relationships`` endpoint with the same
 * ``entity_id`` filter.
 */
export interface KGNeighborResponse {
  entity_id: string
  neighbors: Array<{
    id: string
    name: string
    entity_type: string
    description: string
    canonical_id: string | null
    source_chunk_id: string | null
  }>
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search response — returns BOTH entities and
 * relationships that match the query.
 * ``GET /api/v1/graph/search?query=&type=&limit=``
 *
 * **Why both.** A search for "Cortex" should
 * surface the entity AND any relationship that
 * mentions "Cortex" by type (e.g. a "uses" edge
 * between two other things that's labelled with
 * the relation type that contains "cortex").
 * The frontend uses the entities to build the
 * graph nodes + the relationships to build the
 * edges.
 */
export interface KGSearchResponse {
  query: string
  entities: Array<{
    id: string
    name: string
    entity_type: string
    description: string
    canonical_id: string | null
    source_chunk_id: string | null
  }>
  relationships: Array<{
    id: string
    source_entity_id: string
    target_entity_id: string
    relationship_type: string
    confidence: number
    source_chunk_id: string | null
  }>
}

// ---------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------

/**
 * Shortest path between two entities. The
 * backend's ``GET /api/v1/graph/path?source=&target=&max_depth=``
 * returns this shape (or 404 if no path exists).
 */
export interface KGPathResponse {
  /** The starting entity id (echoes the request). */
  source: string
  /** The ending entity id (echoes the request). */
  target: string
  /** The number of edges in the path. */
  depth: number
  /** Ordered list of entity ids along the path. */
  nodes: string[]
  /** Ordered list of relationship ids along the path. */
  edges: string[]
}
