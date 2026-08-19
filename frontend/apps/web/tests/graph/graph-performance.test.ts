/**
 * Graph — performance + adapter hardening.
 *
 * **F6 Part 4.** The F6 definition of done
 * explicitly calls out an *observable*
 * performance budget on a mid-range laptop
 * (not "it feels fast"). This file pins the
 * parts of that budget we can verify
 * deterministically in unit tests:
 *
 *   - **Adapter determinism.** The
 *     ``toGraph`` / ``searchToGraph`` adapters
 *     must produce the same layout for the
 *     same input. Stable layout = the
 *     selection / camera state survives across
 *     re-renders.
 *   - **Frontend render cap.** The
 *     ``applyGraphLimits`` function truncates
 *     large graphs to a defensive ceiling. We
 *     pin the cap + the truncation notice.
 *   - **No orphan edges.** The cap must never
 *     hand the canvas a half-edge.
 *   - **Adapter is pure.** The adapter doesn't
 *     throw on empty / single-node inputs.
 *   - **Layout is bounded.** A 1,000-node
 *     graph must stay inside ``MAX_RADIUS`` so
 *     the camera doesn't fly off into space.
 *
 * The visual side of the performance budget
 * (frame rate, GPU cost) is verified in
 * Storybook + Playwright + a manual
 * mid-range-laptop run (documented in the
 * F6 final notes).
 */

import { describe, expect, it } from "vitest"

import { pathToGraph, searchToGraph, toGraph } from "@/components/graph/adapters/kg-to-graph"
import {
  GRAPH_RENDER_EDGE_LIMIT,
  GRAPH_RENDER_NODE_LIMIT,
  applyGraphLimits,
} from "@/components/graph/graph-limits"
import type { GraphData } from "@/components/graph/types"
import type { KGEntity, KGRelationship, KGSearchResponse } from "@/types/kg"

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeEntity(id: string, overrides: Partial<KGEntity> = {}): KGEntity {
  return {
    id,
    tenant_id: "tenant-1",
    name: `Entity ${id}`,
    entity_type: "concept",
    description: "",
    properties: {},
    canonical_id: null,
    source_chunk_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeRelationship(
  id: string,
  source: string,
  target: string,
  overrides: Partial<KGRelationship> = {},
): KGRelationship {
  return {
    id,
    tenant_id: "tenant-1",
    source_entity_id: source,
    target_entity_id: target,
    relationship_type: "related_to",
    confidence: 0.9,
    properties: {},
    source_chunk_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

/**
 * Build a synthetic graph of N nodes and a
 * moderate number of edges. Used for the cap +
 * layout-bound tests.
 */
function buildGraph(nodeCount: number, edgeDensity = 0.1): GraphData {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    label: `Node ${i}`,
    type: "concept",
    position: [0, 0, 0] as [number, number, number],
  }))
  const edges: GraphData["edges"] = []
  for (let i = 0; i < nodeCount; i++) {
    for (let j = 0; j < nodeCount; j++) {
      if (i === j) continue
      // Edges are spread out via the density
      // parameter; a 0.1 density over a 1,000-
      // node graph gives ~100,000 edges which
      // is way over the limit. The cap tests
      // use lower densities to avoid hitting
      // the edge limit too early.
      if (((i * 31 + j * 17) % 100) / 100 < edgeDensity) {
        edges.push({
          id: `e${i}-${j}`,
          source: `n${i}`,
          target: `n${j}`,
        })
      }
    }
  }
  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// applyGraphLimits
// ---------------------------------------------------------------------------

describe("applyGraphLimits (F6 Part 4 large-graph protection)", () => {
  it("passes through small graphs unchanged", () => {
    const graph = buildGraph(10, 0.3)
    const result = applyGraphLimits(graph)
    expect(result.truncated).toBe(false)
    expect(result.graph).toBe(graph)
    expect(result.originalNodeCount).toBe(10)
  })

  it("truncates node count past the limit", () => {
    const graph = buildGraph(GRAPH_RENDER_NODE_LIMIT + 50, 0.001)
    const result = applyGraphLimits(graph)
    expect(result.truncated).toBe(true)
    expect(result.graph.nodes.length).toBe(GRAPH_RENDER_NODE_LIMIT)
    expect(result.originalNodeCount).toBe(GRAPH_RENDER_NODE_LIMIT + 50)
  })

  it("truncates edge count past the limit", () => {
    // Build a graph where the node count is
    // fine but the edge count blows past the
    // limit. We do this with a small graph +
    // high density. 50 nodes * 49 directions
    // = 2,450 edges, well past the 1,500 cap.
    const graph = buildGraph(50, 1.0)
    expect(graph.edges.length).toBeGreaterThan(GRAPH_RENDER_EDGE_LIMIT)
    const result = applyGraphLimits(graph)
    expect(result.truncated).toBe(true)
    expect(result.graph.edges.length).toBeLessThanOrEqual(GRAPH_RENDER_EDGE_LIMIT)
  })

  it("never hands the canvas a half-edge after truncation", () => {
    // Build a graph where the truncation
    // removes a node that's the endpoint of
    // many edges.
    const graph = buildGraph(GRAPH_RENDER_NODE_LIMIT + 20, 0.5)
    const result = applyGraphLimits(graph)
    const knownNodeIds = new Set(result.graph.nodes.map((n) => n.id))
    for (const edge of result.graph.edges) {
      expect(knownNodeIds.has(edge.source)).toBe(true)
      expect(knownNodeIds.has(edge.target)).toBe(true)
    }
  })

  it("is deterministic — same input → same output", () => {
    const graph = buildGraph(GRAPH_RENDER_NODE_LIMIT + 50, 0.1)
    const a = applyGraphLimits(graph)
    const b = applyGraphLimits(graph)
    expect(a.graph.nodes.map((n) => n.id)).toEqual(b.graph.nodes.map((n) => n.id))
    expect(a.graph.edges.map((e) => e.id)).toEqual(b.graph.edges.map((e) => e.id))
  })

  it("handles empty input without throwing", () => {
    const result = applyGraphLimits({ nodes: [], edges: [] })
    expect(result.truncated).toBe(false)
    expect(result.graph.nodes).toEqual([])
    expect(result.graph.edges).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// toGraph (entity-rooted) — determinism + bound
// ---------------------------------------------------------------------------

describe("toGraph (F6 Part 4 determinism + layout bounds)", () => {
  it("is deterministic for the same input", () => {
    const root = makeEntity("root", { source_chunk_id: "chunk-1" })
    const neighbors = [
      {
        id: "a",
        name: "A",
        entity_type: "concept",
        description: "",
        canonical_id: null,
        source_chunk_id: null,
      },
      {
        id: "b",
        name: "B",
        entity_type: "person",
        description: "",
        canonical_id: null,
        source_chunk_id: null,
      },
      {
        id: "c",
        name: "C",
        entity_type: "concept",
        description: "",
        canonical_id: null,
        source_chunk_id: null,
      },
    ]
    const relations = [
      makeRelationship("r1", "root", "a"),
      makeRelationship("r2", "root", "b"),
      makeRelationship("r3", "a", "c"),
    ]
    const a = toGraph({ root, relations, neighbors })
    const b = toGraph({ root, relations, neighbors })
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
    expect(a.edges.map((e) => e.id)).toEqual(b.edges.map((e) => e.id))
    for (let i = 0; i < a.nodes.length; i++) {
      expect(a.nodes[i]?.position).toEqual(b.nodes[i]?.position)
    }
  })

  it("preserves backend metadata on the root node", () => {
    const root = makeEntity("root", {
      canonical_id: "canonical-1",
      source_chunk_id: "chunk-1",
    })
    const result = toGraph({ root, relations: [], neighbors: [] })
    const rootNode = result.nodes.find((n) => n.id === "root")
    expect(rootNode?.metadata?.canonicalId).toBe("canonical-1")
    expect(rootNode?.metadata?.sourceChunkId).toBe("chunk-1")
  })

  it("the root node lands at the origin", () => {
    const root = makeEntity("root")
    const result = toGraph({
      root,
      relations: [],
      neighbors: [
        {
          id: "a",
          name: "A",
          entity_type: "concept",
          description: "",
          canonical_id: null,
          source_chunk_id: null,
        },
      ],
    })
    const rootNode = result.nodes.find((n) => n.id === "root")
    expect(rootNode?.position).toEqual([0, 0, 0])
  })

  it("drops relations that reference unknown nodes (adapter is the last line of defence)", () => {
    const root = makeEntity("root")
    const neighbors = [
      {
        id: "a",
        name: "A",
        entity_type: "concept",
        description: "",
        canonical_id: null,
        source_chunk_id: null,
      },
    ]
    const relations = [
      makeRelationship("r1", "root", "a"),
      // The "ghost" relation references a node
      // we never loaded. The adapter must
      // drop it.
      makeRelationship("r-ghost", "root", "ghost"),
    ]
    const result = toGraph({ root, relations, neighbors })
    expect(result.edges.map((e) => e.id)).toEqual(["r1"])
  })

  it("is layout-bounded for 1,000 nodes (stays inside MAX_RADIUS)", () => {
    // A 1,000-node graph is bigger than the
    // render cap but the adapter still needs
    // to produce a sane layout. The cap is
    // applied by ``applyGraphLimits`` after
    // the adapter; this test pins the
    // adapter's own bound.
    const root = makeEntity("root")
    const neighbors = Array.from({ length: 999 }, (_, i) => ({
      id: `n${i}`,
      name: `N${i}`,
      entity_type: "concept",
      description: "",
      canonical_id: null,
      source_chunk_id: null,
    }))
    const result = toGraph({ root, relations: [], neighbors })
    const maxRadius = 12 // MAX_RADIUS from the adapter
    for (const node of result.nodes) {
      const [x, y, z] = node.position
      const distance = Math.sqrt(x * x + y * y + z * z)
      expect(distance).toBeLessThanOrEqual(maxRadius + 0.1)
    }
  })

  it("handles an entity with zero neighbours without throwing", () => {
    const root = makeEntity("root")
    const result = toGraph({ root, relations: [], neighbors: [] })
    expect(result.nodes).toHaveLength(1)
    expect(result.edges).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// searchToGraph
// ---------------------------------------------------------------------------

describe("searchToGraph (F6 Part 4 determinism)", () => {
  it("is deterministic for the same search response", () => {
    const response: KGSearchResponse = {
      query: "alpha",
      entities: [
        {
          id: "e1",
          name: "Alpha",
          entity_type: "concept",
          description: "",
          canonical_id: null,
          source_chunk_id: null,
        },
        {
          id: "e2",
          name: "Beta",
          entity_type: "person",
          description: "",
          canonical_id: null,
          source_chunk_id: null,
        },
      ],
      relationships: [
        {
          id: "r1",
          source_entity_id: "e1",
          target_entity_id: "e2",
          relationship_type: "knows",
          confidence: 0.8,
          source_chunk_id: null,
        },
      ],
    }
    const a = searchToGraph(response)
    const b = searchToGraph(response)
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id))
    expect(a.edges.map((e) => e.id)).toEqual(b.edges.map((e) => e.id))
  })

  it("drops relationships whose endpoints aren't in the entity set", () => {
    const response: KGSearchResponse = {
      query: "alpha",
      entities: [
        {
          id: "e1",
          name: "Alpha",
          entity_type: "concept",
          description: "",
          canonical_id: null,
          source_chunk_id: null,
        },
      ],
      relationships: [
        {
          id: "r-orphan",
          source_entity_id: "e1",
          target_entity_id: "missing",
          relationship_type: "knows",
          confidence: 0.8,
          source_chunk_id: null,
        },
      ],
    }
    const result = searchToGraph(response)
    expect(result.edges).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// pathToGraph
// ---------------------------------------------------------------------------

describe("pathToGraph (F6 Part 4)", () => {
  it("preserves the path order — source is the first node", () => {
    const a = makeEntity("a")
    const b = makeEntity("b")
    const c = makeEntity("c")
    const r1 = makeRelationship("r1", "a", "b")
    const r2 = makeRelationship("r2", "b", "c")
    const result = pathToGraph({
      path: { nodes: ["a", "b", "c"], edges: ["r1", "r2"] },
      entities: [a, b, c],
      relations: [r1, r2],
    })
    expect(result.nodes.map((n) => n.id)).toEqual(["a", "b", "c"])
    expect(result.nodes[0]?.position).toEqual([0, 0, 0])
    expect(result.edges.map((e) => e.id)).toEqual(["r1", "r2"])
  })

  it("drops path edges that reference missing entities", () => {
    const a = makeEntity("a")
    const b = makeEntity("b")
    const r1 = makeRelationship("r1", "a", "b")
    const result = pathToGraph({
      path: { nodes: ["a", "b", "missing"], edges: ["r1", "r-orphan"] },
      entities: [a, b],
      relations: [r1],
    })
    expect(result.nodes.map((n) => n.id)).toEqual(["a", "b"])
    expect(result.edges.map((e) => e.id)).toEqual(["r1"])
  })
})

// ---------------------------------------------------------------------------
// Constants — pin the F6 budget
// ---------------------------------------------------------------------------

describe("F6 Part 4 — performance budget constants", () => {
  it("GRAPH_RENDER_NODE_LIMIT is the documented 500", () => {
    // The cap is documented in graph-limits.ts
    // and the F6 final notes. Pin the value so
    // a future "let's just bump it to 5000"
    // PR can't slip through silently.
    expect(GRAPH_RENDER_NODE_LIMIT).toBe(500)
  })

  it("GRAPH_RENDER_EDGE_LIMIT is 3:1 (1,500)", () => {
    expect(GRAPH_RENDER_EDGE_LIMIT).toBe(1_500)
  })
})
