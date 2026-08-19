/**
 * Graph — rendering-level types.
 *
 * **F6 Part 1.** These are the *internal* shapes the
 * Three.js layer consumes. They deliberately do NOT
 * mirror the backend Knowledge-Graph response —
 * Part 2 will introduce real API models and a
 * dedicated adapter that converts them to these
 * rendering types.
 *
 * **Why split the model.**
 *   1. The backend response will evolve (new
 *      relationship types, weighted edges, etc.).
 *      The rendering layer should be insulated
 *      from those changes.
 *   2. The 3D scene needs positions; the backend
 *      won't return them. The adapter can compute
 *      them from a layout algorithm.
 *   3. Tests can use plain data without faking the
 *      full API response.
 *
 * **Type families.**
 *   - ``GraphNode`` — what the user sees as a node
 *     in 3D space.
 *   - ``GraphEdge`` — the relationship line
 *     between two nodes.
 *   - ``GraphData`` — the top-level shape a
 *     renderer consumes (nodes + edges).
 *   - ``GraphNodeState`` — per-node visual state
 *     (default / selected / active-path / dimmed).
 *     The component prepares for the eventual
 *     traversal pulse; Part 1 only uses
 *     ``default`` and ``selected``.
 *
 * **Stability.** Adding a field is a non-breaking
 * change for the rendering layer; renaming or
 * removing one is.
 */

/**
 * Visual state of a single graph node.
 *
 * - ``default``     — idle, the resting state
 * - ``selected``    — currently picked by the user
 * - ``active-path`` — on the active traversal path
 *                     (Part 2 wires this to query
 *                     results; the component prepares
 *                     the surface today)
 * - ``dimmed``      — out of focus, lower opacity
 */
export type GraphNodeState = "default" | "selected" | "active-path" | "dimmed"

/**
 * A single renderable node.
 *
 * ``position`` is in world space (R3F units). The
 * adapter that translates API models to this shape
 * is responsible for choosing a layout — the demo
 * dataset in ``data/demo-graph.ts`` uses fixed
 * positions, the production adapter will eventually
 * run a force-directed layout on the server.
 *
 * **F6 Part 2 — backend metadata preservation.**
 * ``metadata`` carries the backend's own ids
 * (canonical id, source chunk id) so the detail
 * panel + the source-document click-through can
 * reach the real entity + the real source without
 * a second round-trip. The ``id`` field is the
 * primary key (also the backend id); the
 * ``metadata`` fields are optional overrides the
 * backend uses for merges + provenance.
 */
export interface GraphNode {
  /** Stable id (UUID from the backend, or a stable
   *  dev-data id for the demo dataset). */
  id: string
  /** Human-readable label rendered next to the node. */
  label: string
  /** Entity type — drives the node's geometry /
   *  colour variant in later parts. */
  type: string
  /** World-space position. */
  position: [number, number, number]
  /** **F6 Part 2 — backend provenance.** Optional
   *  metadata preserved through the API →
   *  rendering translation. The ``id`` field is
   *  the row the user sees; ``metadata`` is the
   *  backend's view of the same row + its
   *  lineage. */
  metadata?: GraphNodeMetadata
}

/**
 * Backend metadata preserved on every node.
 *
 * **Why this lives on the rendering type.** The
 * detail panel + the source-document click-through
 * need the backend's ids (canonical id, source
 * chunk id) at click-time. Threading them through
 * the cache as part of the render model keeps the
 * click handler pure (no async lookup, no
 * refetch, no race with the search input).
 */
export interface GraphNodeMetadata {
  /** The "merge" canonical id, if this node is
   *  a duplicate of another. The frontend treats
   *  the canonical row as the user-facing
   *  primary. */
  canonicalId: string | null
  /** The source chunk the entity was extracted
   *  from. ``null`` for manually-created entities
   *  or after the source chunk was deleted. */
  sourceChunkId: string | null
  /** The original ``entity_type`` string. The
   *  rendering type's ``type`` is the same
   *  value today (the adapter doesn't transform
   *  it) but the metadata is kept for future
   *  per-type geometry work. */
  entityType: string
  /** Backend-extracted description, if any. */
  description: string
}

/**
 * A single renderable edge connecting two nodes.
 *
 * Edges are undirected for the rendering layer;
 * the backend can return a direction later and
 * the adapter can decide whether to show an
 * arrowhead. ``source`` and ``target`` are node
 * ids.
 *
 * **F6 Part 2 — backend metadata preservation.**
 * ``metadata`` carries the LLM's confidence score
 * and the source-chunk id so the click-through
 * + the future "highlight low-confidence" toggle
 * have what they need.
 */
export interface GraphEdge {
  id: string
  source: string
  target: string
  /** Short label for the relationship type
   *  (e.g. "contains", "cites"). Optional — when
   *  omitted the edge renders without a label. */
  relationType?: string
  /** **F6 Part 2 — backend provenance.** Optional
   *  metadata preserved through the API →
   *  rendering translation. The ``id`` field
   *  is the row the user sees; ``metadata``
   *  carries the LLM's confidence + the source
   *  chunk so the detail panel can render it. */
  metadata?: GraphEdgeMetadata
}

/**
 * Backend metadata preserved on every edge.
 */
export interface GraphEdgeMetadata {
  /** The relationship_type as the backend
   *  stored it (the same string the adapter
   *  maps to ``relationType`` — kept here for
   *  future per-type styling work). */
  relationshipType: string
  /** LLM confidence. ``0..1``. The detail panel
   *  shows this as a small badge; the canvas
   *  doesn't render it today. */
  confidence: number
  /** The source chunk the edge was extracted
   *  from. ``null`` for manually-created
   *  relationships. */
  sourceChunkId: string | null
}

/**
 * The full graph data a renderer consumes.
 *
 * The adapter's output shape; Part 1 builds the
 * demo dataset in this shape, Part 2's adapter
 * will translate the API response into it.
 */
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * A position tuple for a 3D coordinate.
 *
 * Re-exported under an alias so call sites can
 * ``import type { Vec3 } from "..."`` without
 * pulling in a `three` dependency.
 */
export type Vec3 = [number, number, number]
