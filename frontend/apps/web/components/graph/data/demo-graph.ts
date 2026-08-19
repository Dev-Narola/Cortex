/**
 * Demo graph dataset — development only.
 *
 * **F6 Part 1.** This file ships a small static
 * graph so the rendering architecture can be
 * proven end-to-end without backend integration.
 * The real Cortex Knowledge-Graph API lands in
 * F6 Part 2; this dataset is replaced wholesale
 * by an adapter that translates API models into
 * ``GraphData``.
 *
 * **Why a fixed dataset.**
 *   1. The 3D scene can be inspected without
 *      waiting on the backend.
 *   2. Tests can mount the rendering layer with
 *      a known shape and assert behaviour.
 *   3. Designers can review the visual hierarchy
 *      without seeded data.
 *
 * **Do not import in production code paths.** The
 * ``GraphExplorer`` only consumes this in the
 * absence of a real data source; the production
 * wiring is the API adapter (Part 2). When Part 2
 * lands, this file should be deleted, not
 * silently merged into the production path.
 *
 * **Layout.** Hand-placed positions in a
 * comfortable spread (~6 unit radius from
 * origin). No force simulation yet — the goal
 * is to prove ``data → nodes → edges → scene``
 * without the layout detour.
 */

import type { GraphData } from "../types"

export const DEMO_GRAPH: GraphData = {
  nodes: [
    {
      id: "cortex",
      label: "Cortex",
      type: "system",
      position: [0, 0, 0],
    },
    {
      id: "search",
      label: "Search",
      type: "capability",
      position: [-3, 1.5, -1],
    },
    {
      id: "knowledge",
      label: "Knowledge",
      type: "capability",
      position: [3, 1.5, -1],
    },
    {
      id: "retrieval",
      label: "Retrieval",
      type: "capability",
      position: [-4.5, -1.5, 1],
    },
    {
      id: "graph",
      label: "Graph",
      type: "capability",
      position: [4.5, -1.5, 1],
    },
    {
      id: "documents",
      label: "Documents",
      type: "data",
      position: [0, -3, 2],
    },
    {
      id: "agents",
      label: "Agents",
      type: "capability",
      position: [0, 3, 2],
    },
  ],
  edges: [
    {
      id: "cortex-search",
      source: "cortex",
      target: "search",
      relationType: "powers",
    },
    {
      id: "cortex-knowledge",
      source: "cortex",
      target: "knowledge",
      relationType: "powers",
    },
    {
      id: "cortex-agents",
      source: "cortex",
      target: "agents",
      relationType: "orchestrates",
    },
    {
      id: "search-retrieval",
      source: "search",
      target: "retrieval",
      relationType: "uses",
    },
    {
      id: "knowledge-graph",
      source: "knowledge",
      target: "graph",
      relationType: "uses",
    },
    {
      id: "retrieval-documents",
      source: "retrieval",
      target: "documents",
      relationType: "queries",
    },
    {
      id: "graph-documents",
      source: "graph",
      target: "documents",
      relationType: "indexes",
    },
  ],
}

/**
 * Convenience: list of node ids for quick lookup
 * in tests + the search bar.
 */
export const DEMO_NODE_IDS = DEMO_GRAPH.nodes.map((n) => n.id)
