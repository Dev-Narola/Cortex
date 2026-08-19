/**
 * Graph — barrel export.
 *
 * **F6 Part 1.** Every component + type the
 * rest of the app needs to import lives here.
 * Internal helpers (``GraphNodeInternals``,
 * ``GraphEdgeInternals``, ``computeEdgeTransform``)
 * are intentionally NOT re-exported — they're
 * test-only.
 */

export { GraphCanvas } from "./graph-canvas"
export { GraphEdge } from "./graph-edge"
export { GraphExplorer } from "./graph-explorer"
export { GraphNode } from "./graph-node"
export { GraphNodeDetail } from "./graph-node-detail"
export { GraphSearch } from "./graph-search"

export type {
  GraphData,
  GraphEdge as GraphEdgeData,
  GraphNode as GraphNodeData,
  GraphNodeState,
  Vec3,
} from "./types"

export { DEMO_GRAPH, DEMO_NODE_IDS } from "./data/demo-graph"
