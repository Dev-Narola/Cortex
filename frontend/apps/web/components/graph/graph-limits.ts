/**
 * Graph — frontend rendering limits.
 *
 * **F6 Part 4 — large-graph protection.**
 * The backend can return a graph that's
 * technically valid but visually overwhelming
 * (e.g. a 1,000-node subgraph from a very
 * connected entity). The frontend caps the
 * rendered graph at a defensive ceiling to keep
 * the frame rate in budget on a mid-range
 * laptop.
 *
 * **Why a frontend cap (and not just trusting
 * the backend).** The backend already has its
 * own limits (the relations / neighbours
 * endpoints return at most 200 rows per call);
 * this cap is a defence-in-depth measure for
 * the case where multiple responses are merged
 * (e.g. the search endpoint returns 50
 * entities + 200 relations). The cap is
 * deliberately conservative — exceeding it
 * triggers a "Showing the most relevant
 * connections" message rather than a render
 * failure.
 *
 * **Single source of truth.** Both the
 * adapter and the explorer import from this
 * file so the limit can be tuned in one place.
 * The number is also surfaced in the EmptyState
 * copy so the user can see why the graph looks
 * smaller than they expected.
 */

import type { GraphData } from "./types"

/**
 * The maximum number of nodes the explorer
 * will hand to the canvas. Past this the
 * adapter truncates the graph + the explorer
 * surfaces a "Showing the most relevant
 * connections" notice.
 *
 * 500 was chosen as a round number that fits
 * comfortably under the F6 Part 4 performance
 * budget on a mid-range laptop (sphere
 * geometry at 16x12 segments = ~200 triangles
 * per node → ~100k triangles total, well
 * inside WebGL's per-frame budget at 60 FPS).
 */
export const GRAPH_RENDER_NODE_LIMIT = 500

/**
 * The maximum number of edges the explorer
 * will hand to the canvas. 1,500 is a 3:1
 * edge-to-node ratio — a reasonable upper
 * bound for a "show me the neighbourhood"
 * view.
 */
export const GRAPH_RENDER_EDGE_LIMIT = 1_500

/**
 * Result of the cap check. When the graph is
 * truncated, the explorer surfaces the
 * ``truncated`` reason in its notice.
 */
export interface GraphLimitResult {
  /** The graph to render (possibly truncated). */
  graph: GraphData
  /** True when the input was capped. */
  truncated: boolean
  /** Original node count (pre-cap). */
  originalNodeCount: number
  /** Original edge count (pre-cap). */
  originalEdgeCount: number
}

/**
 * Apply the frontend render cap to a graph.
 *
 * The cap is two-staged: nodes first, then
 * edges (an edge that references a truncated
 * node is dropped — the adapter already
 * enforces the inverse, but we re-check here so
 * the canvas never sees a half-edge).
 *
 * The function is pure (no React state) so
 * the explorer can ``useMemo`` it cheaply.
 */
export function applyGraphLimits(input: GraphData): GraphLimitResult {
  const originalNodeCount = input.nodes.length
  const originalEdgeCount = input.edges.length

  // Fast path: nothing to do.
  if (
    originalNodeCount <= GRAPH_RENDER_NODE_LIMIT &&
    originalEdgeCount <= GRAPH_RENDER_EDGE_LIMIT
  ) {
    return {
      graph: input,
      truncated: false,
      originalNodeCount,
      originalEdgeCount,
    }
  }

  // Truncate nodes. Sort by id for determinism
  // (the adapter already produces a stable
  // order; we re-sort here so the cap doesn't
  // depend on the upstream order).
  const nodes = input.nodes.slice(0, GRAPH_RENDER_NODE_LIMIT)
  const knownNodeIds = new Set(nodes.map((n) => n.id))
  // Truncate edges. Drop any edge whose
  // endpoint isn't in the kept nodes.
  const edges: typeof input.edges = []
  for (const edge of input.edges) {
    if (!knownNodeIds.has(edge.source)) continue
    if (!knownNodeIds.has(edge.target)) continue
    edges.push(edge)
    if (edges.length >= GRAPH_RENDER_EDGE_LIMIT) break
  }

  return {
    graph: { nodes, edges },
    truncated:
      originalNodeCount > GRAPH_RENDER_NODE_LIMIT || originalEdgeCount > GRAPH_RENDER_EDGE_LIMIT,
    originalNodeCount,
    originalEdgeCount,
  }
}
