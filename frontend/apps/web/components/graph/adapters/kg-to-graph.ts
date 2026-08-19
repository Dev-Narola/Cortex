/**
 * KG → Graph adapter.
 *
 * **F6 Part 2.** Translates the backend's
 * ``KGEntity`` / ``KGRelationship`` types into
 * the rendering layer's ``GraphNode`` /
 * ``GraphEdge`` types. **The only place the
 * rendering types meet the API contract.**
 *
 * **Why a separate adapter (not inlined in the
 * hook).** Three reasons:
 *   1. **Testability.** The adapter is a pure
 *      function — ``adapter.toGraph(search)`` —
 *      that's easy to unit-test against canned
 *      API responses. The hook can stay focused
 *      on the TanStack Query contract.
 *   2. **Layout.** The adapter owns the
 *      position-generation strategy (the spec
 *      says "no force simulation in Part 1" —
 *      we use a deterministic radial spread so
 *      a search always renders the same way).
 *      Part 4 can swap the layout function
 *      without touching the hooks.
 *   3. **Drift protection.** If the backend
 *      adds a field, the adapter is the only
 *      place that needs to know. The rendering
 *      types stay stable.
 *
 * **Backend IDs are preserved.** The adapter
 * copies ``canonical_id`` and ``source_chunk_id``
 * from the API into ``GraphNodeMetadata`` so the
 * detail panel + the source-doc click-through
 * have them at click-time without a refetch.
 *
 * **The function is deterministic.** Given the
 * same API response, the adapter always produces
 * the same graph (positions, node ordering).
 * The explorer relies on this for stable
 * selection + camera focus across re-renders.
 */

import type { KGEntity, KGRelationship, KGSearchResponse } from "@/types/kg"
import type { GraphData, GraphEdge, GraphEdgeMetadata, GraphNode, Vec3 } from "../types"

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * The radial spread. The adapter places the
 * "root" entity at the origin and the rest of
 * the graph on a circle around it. The radius
 * scales with the number of nodes so a 5-node
 * graph doesn't have the same crowding as a
 * 50-node one.
 */
const BASE_RADIUS = 3.5
const RADIUS_PER_NODE = 0.05
const MAX_RADIUS = 12

/**
 * The seed for the deterministic shuffle. The
 * adapter's positions are stable for a given
 * set of ids + ordering; the seed just gives a
 * pleasant visual spread (pure-math PRNG, no
 * random source).
 */
const SHUFFLE_SEED = 0xc0ffee

/**
 * Cheap deterministic PRNG (Mulberry32) so the
 * visual spread is reproducible per-graph.
 * Same ids + same ordering = same positions
 * across renders.
 */
function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministically shuffle a list. Stable
 * for the same input — Part 4's "re-layout
 * on demand" toggle can call this with a
 * different seed (e.g. one derived from a
 * user gesture) to perturb the layout.
 */
function shuffleStable<T>(items: T[], seed: number): T[] {
  const out = items.slice()
  const rand = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const a = out[i]
    const b = out[j]
    if (a !== undefined && b !== undefined) {
      out[i] = b
      out[j] = a
    }
  }
  return out
}

/**
 * Compute the world-space position for a node
 * at index ``i`` in a graph of size ``n``.
 *
 * ``rootId`` is the "centre of the world" —
 * usually the entity the user just selected.
 * ``rootId`` lands at the origin; the rest of
 * the nodes spread around it in the Y=0 plane
 * (Part 2 — Part 4 can lift the plane to a
 * sphere or a force-directed layout).
 */
function positionFor(index: number, total: number, radius: number, isRoot: boolean): Vec3 {
  if (isRoot) return [0, 0, 0]
  // Subtract 1 because the root takes the
  // first slot in the ordering.
  const i = index - 1
  const n = total - 1
  if (n <= 0) return [0, 0, 0]
  // Even spread around the ring. Slight Y
  // wobble (one node slightly above, one
  // below) keeps the graph from looking
  // perfectly flat.
  const theta = (i / n) * Math.PI * 2
  const yWobble = (i % 2 === 0 ? 0.4 : -0.4) * (radius / 6)
  return [Math.cos(theta) * radius, yWobble, Math.sin(theta) * radius]
}

// ---------------------------------------------------------------------------
// Entity → GraphNode
// ---------------------------------------------------------------------------

/**
 * The seed for a graph's stable layout is
 * derived from the sorted entity ids. Same
 * entity set = same layout, across renders
 * and across users.
 */
function seedForEntityIds(ids: string[]): number {
  const sorted = ids.slice().sort()
  let s = SHUFFLE_SEED
  for (const id of sorted) {
    for (let i = 0; i < id.length; i++) {
      s = ((s * 31) ^ id.charCodeAt(i)) >>> 0
    }
  }
  return s >>> 0
}

/**
 * Convert a single backend entity into a
 * renderable node. Position is determined by
 * the index within the layout — see
 * :func:`positionFor`.
 */
function entityToNode(
  entity: KGEntity,
  index: number,
  total: number,
  radius: number,
  isRoot: boolean,
): GraphNode {
  return {
    id: entity.id,
    label: entity.name,
    type: entity.entity_type,
    position: positionFor(index, total, radius, isRoot),
    metadata: {
      canonicalId: entity.canonical_id,
      sourceChunkId: entity.source_chunk_id,
      entityType: entity.entity_type,
      description: entity.description,
    },
  }
}

// ---------------------------------------------------------------------------
// Relationship → GraphEdge
// ---------------------------------------------------------------------------

/**
 * Convert a single backend relationship into a
 * renderable edge. Drops the edge if either
 * endpoint isn't in the graph (a defensive
 * measure — the adapter never wants to hand
 * the renderer a half-edge).
 */
function relationshipToEdge(rel: KGRelationship, knownNodeIds: Set<string>): GraphEdge | null {
  if (!knownNodeIds.has(rel.source_entity_id)) return null
  if (!knownNodeIds.has(rel.target_entity_id)) return null
  const meta: GraphEdgeMetadata = {
    relationshipType: rel.relationship_type,
    confidence: rel.confidence,
    sourceChunkId: rel.source_chunk_id,
  }
  return {
    id: rel.id,
    source: rel.source_entity_id,
    target: rel.target_entity_id,
    relationType: rel.relationship_type,
    metadata: meta,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert the union of (root entity + its
 * relations + its neighbors) into a renderable
 * graph. This is the entry point the explorer
 * uses once all the TanStack queries have
 * resolved.
 *
 * **The signature accepts the raw pieces, not a
 * pre-merged object.** Three reasons:
 *   1. The hooks fetch each piece separately
 *      (entity, relations, neighbors); the
 *      adapter is the single merge point.
 *   2. The caller (explorer) controls which
 *      pieces are required vs optional — Part 3
 *      keeps the graph when relations fail
 *      (Task 19); the entity-only path can pass
 *      ``relations = []`` without inventing a
 *      "no relations" sentinel.
 *   3. The contract test can exercise every
 *      combination (entity + no relations,
 *      entity + empty relations, etc.) without
 *      a fixture builder.
 */
export interface ToGraphInput {
  /** The root entity — the one the user
   *  selected. Required. */
  root: KGEntity
  /** Every relationship touching the root
   *  (both endpoints). The adapter drops
   *  edges that don't connect two entities
   *  in the ``neighbors`` list. */
  relations: KGRelationship[]
  /** The entities the root is connected to
   *  (the ``/neighbors`` response). May
   *  include entities that are connected to
   *  the root via a relation not in
   *  ``relations`` — the explorer uses
   *  ``relations`` as the source of truth for
   *  edges. */
  neighbors: Array<{
    id: string
    name: string
    entity_type: string
    description: string
    canonical_id: string | null
    source_chunk_id: string | null
  }>
}

export function toGraph(input: ToGraphInput): GraphData {
  // ----- nodes -----
  // The root + every neighbor become a node.
  // The neighbor payloads are partial (no
  // description, no properties) — we
  // synthesise a full entity from the
  // available fields.
  const neighborEntities: KGEntity[] = input.neighbors.map((n) => ({
    id: n.id,
    tenant_id: input.root.tenant_id,
    name: n.name,
    entity_type: n.entity_type,
    description: n.description,
    properties: {},
    canonical_id: n.canonical_id,
    source_chunk_id: n.source_chunk_id,
    created_at: "",
  }))
  // Deduplicate by id (the neighbor endpoint
  // can return the root in its result in some
  // edge cases; we don't want two nodes for
  // the same entity).
  const entityById = new Map<string, KGEntity>()
  entityById.set(input.root.id, input.root)
  for (const e of neighborEntities) entityById.set(e.id, e)
  // Stable ordering for the layout — sort by
  // id so the visual order doesn't depend on
  // the API response order.
  const allEntities = Array.from(entityById.values()).sort((a, b) => a.id.localeCompare(b.id))
  const allIds = allEntities.map((e) => e.id)
  const seed = seedForEntityIds(allIds)
  const shuffled = shuffleStable(allEntities, seed)
  // The root lands at the front of the
  // ordering (so the radial spread centres on
  // it). We re-sort to put the root first,
  // then keep the rest in the shuffled order.
  const rootIndex = shuffled.findIndex((e) => e.id === input.root.id)
  if (rootIndex > 0) {
    const root = shuffled[rootIndex]
    if (root) {
      shuffled.splice(rootIndex, 1)
      shuffled.unshift(root)
    }
  }
  const total = shuffled.length
  const radius = Math.min(MAX_RADIUS, BASE_RADIUS + total * RADIUS_PER_NODE)
  const nodes: GraphNode[] = shuffled.map((entity, i) =>
    entityToNode(entity, i, total, radius, i === 0),
  )
  const nodeIdSet = new Set(nodes.map((n) => n.id))

  // ----- edges -----
  // Every relation that connects two known
  // nodes becomes an edge. The knownNodeIds
  // check rejects relations referencing
  // entities we didn't load (a defensive
  // measure for the case where the
  // relationships endpoint returns an edge
  // whose other endpoint isn't in the
  // neighbors list — the backend shouldn't
  // do this, but the adapter is the last
  // line of defence).
  const knownNodeIds = nodeIdSet
  const edges: GraphEdge[] = []
  for (const rel of input.relations) {
    const edge = relationshipToEdge(rel, knownNodeIds)
    if (edge) edges.push(edge)
  }

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// Search → Graph
// ---------------------------------------------------------------------------

/**
 * Convert a search response into a renderable
 * graph. The search endpoint already returns
 * both entities and the relationships
 * referencing them, so the converter doesn't
 * need to make a second round-trip.
 *
 * **Why a separate function.** The search
 * response is a *snapshot* of every entity +
 * relation that matched the query — the
 * resulting graph is dense and might not be
 * centred on any single node. The entity-roots
 * flow above is centred on a picked entity.
 * The two have different layout + UX
 * expectations, so they need different
 * converters.
 */
export function searchToGraph(response: KGSearchResponse): GraphData {
  const entityById = new Map<string, KGEntity>()
  for (const e of response.entities) {
    entityById.set(e.id, {
      id: e.id,
      tenant_id: "",
      name: e.name,
      entity_type: e.entity_type,
      description: e.description,
      properties: {},
      canonical_id: e.canonical_id,
      source_chunk_id: e.source_chunk_id,
      created_at: "",
    })
  }
  // If the search returned relationships but
  // not their endpoints (a backend edge case),
  // we can't draw those edges. The filter
  // below drops them rather than synthesise
  // empty entities.
  const nodeIds = Array.from(entityById.keys()).sort()
  const seed = seedForEntityIds(nodeIds)
  const shuffled = shuffleStable(Array.from(entityById.values()), seed)
  const total = shuffled.length
  const radius = Math.min(MAX_RADIUS, BASE_RADIUS + total * RADIUS_PER_NODE)
  const nodes: GraphNode[] = shuffled.map((entity, i) =>
    entityToNode(entity, i, total, radius, false),
  )
  const knownNodeIds = new Set(nodes.map((n) => n.id))
  const edges: GraphEdge[] = []
  for (const rel of response.relationships) {
    const edge = relationshipToEdge(
      {
        id: rel.id,
        tenant_id: "",
        source_entity_id: rel.source_entity_id,
        target_entity_id: rel.target_entity_id,
        relationship_type: rel.relationship_type,
        confidence: rel.confidence,
        properties: {},
        source_chunk_id: rel.source_chunk_id,
        created_at: "",
      },
      knownNodeIds,
    )
    if (edge) edges.push(edge)
  }
  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// Path → Graph
// ---------------------------------------------------------------------------

/**
 * Convert a shortest-path response into a
 * renderable graph. The path only contains ids
 * — the caller is expected to have already
 * fetched the entity + relationship details
 * (or at minimum, the labels). The helper
 * accepts the resolved entities + relations
 * so the path response itself stays small.
 */
export function pathToGraph(input: {
  path: { nodes: string[]; edges: string[] }
  entities: KGEntity[]
  relations: KGRelationship[]
}): GraphData {
  const entityById = new Map<string, KGEntity>()
  for (const e of input.entities) entityById.set(e.id, e)
  const ordered = input.path.nodes
    .map((id) => entityById.get(id))
    .filter((e): e is KGEntity => Boolean(e))
  // The first node in the path is the
  // "source" (the user's start) — it lands at
  // the origin. The rest spread around it.
  const radius = Math.min(MAX_RADIUS, BASE_RADIUS + ordered.length * RADIUS_PER_NODE)
  const nodes: GraphNode[] = ordered.map((entity, i) =>
    entityToNode(entity, i, ordered.length, radius, i === 0),
  )
  const relById = new Map<string, KGRelationship>()
  for (const r of input.relations) relById.set(r.id, r)
  const knownNodeIds = new Set(nodes.map((n) => n.id))
  const edges: GraphEdge[] = []
  for (const edgeId of input.path.edges) {
    const rel = relById.get(edgeId)
    if (!rel) continue
    const edge = relationshipToEdge(rel, knownNodeIds)
    if (edge) edges.push(edge)
  }
  return { nodes, edges }
}
