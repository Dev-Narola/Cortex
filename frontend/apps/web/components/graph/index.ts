/**
 * Graph — barrel export.
 *
 * F6 Part 2. Every component + type the rest
 * of the app needs to import lives here.
 * Internal helpers are intentionally NOT
 * re-exported (test-only).
 */

export { GraphCanvas } from "./graph-canvas"
export { GraphEdge } from "./graph-edge"
export { GraphExplorer } from "./graph-explorer"
export { GraphNode } from "./graph-node"
export { GraphNodeDetail, openSourceDocument } from "./graph-node-detail"
export { GraphSearch } from "./graph-search"
export { GraphSearchResults } from "./graph-search-results"
export { applyGraphLimits, GRAPH_RENDER_NODE_LIMIT, GRAPH_RENDER_EDGE_LIMIT } from "./graph-limits"
export type { GraphLimitResult } from "./graph-limits"

export type {
  GraphData,
  GraphEdge as GraphEdgeData,
  GraphEdgeMetadata,
  GraphNode as GraphNodeData,
  GraphNodeMetadata,
  GraphNodeState,
  Vec3,
} from "./types"

export { toGraph, searchToGraph, pathToGraph } from "./adapters/kg-to-graph"
export type { ActivePath, GraphExplorerProps } from "./graph-explorer"
export type { GraphCanvasProps } from "./graph-canvas"

// Demo dataset is still exported for tests
// + Storybook. The production route does
// NOT consume it (per the F6 Part 2 spec).
export { DEMO_GRAPH, DEMO_NODE_IDS } from "./data/demo-graph"
