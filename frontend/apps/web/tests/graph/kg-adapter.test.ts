/**
 * KG → Graph adapter — F6 Part 2.
 *
 * Pins the API → rendering translation. The
 * adapter is the single place the rendering
 * types meet the API contract, so any change
 * in the backend shape ripples here.
 */

import { describe, expect, it } from "vitest"

import { searchToGraph, toGraph } from "@/components/graph"
import type { KGEntity, KGSearchResponse } from "@/types/kg"

const rootEntity: KGEntity = {
  id: "root",
  tenant_id: "t1",
  name: "Root",
  entity_type: "concept",
  description: "Root entity",
  properties: {},
  canonical_id: null,
  source_chunk_id: "c1",
  created_at: "",
  updated_at: "",
}

const neighborA: KGEntity = {
  id: "a",
  tenant_id: "t1",
  name: "A",
  entity_type: "concept",
  description: "A description",
  properties: {},
  canonical_id: null,
  source_chunk_id: "c2",
  created_at: "",
}

describe("toGraph (entity-rooted)", () => {
  it("returns nodes for the root + every neighbor, dropping relations referencing unknown nodes", () => {
    const graph = toGraph({
      root: rootEntity,
      relations: [
        {
          id: "r1",
          tenant_id: "t1",
          source_entity_id: "root",
          target_entity_id: "a",
          relationship_type: "uses",
          confidence: 0.9,
          properties: {},
          source_chunk_id: "c1",
          created_at: "",
        },
        // Dropped — endpoint "ghost" not in the
        // neighbor list.
        {
          id: "r2",
          tenant_id: "t1",
          source_entity_id: "root",
          target_entity_id: "ghost",
          relationship_type: "uses",
          confidence: 0.5,
          properties: {},
          source_chunk_id: null,
          created_at: "",
        },
      ],
      neighbors: [
        {
          id: "a",
          name: "A",
          entity_type: "concept",
          description: "A description",
          canonical_id: null,
          source_chunk_id: "c2",
        },
      ],
    })
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["a", "root"])
    expect(graph.edges.map((e) => e.id).sort()).toEqual(["r1"])
  })

  it("preserves backend metadata on every node (canonical_id + source_chunk_id)", () => {
    const graph = toGraph({
      root: { ...rootEntity, canonical_id: "primary-id" },
      relations: [],
      neighbors: [],
    })
    const root = graph.nodes.find((n) => n.id === "root")
    expect(root?.metadata?.canonicalId).toBe("primary-id")
    expect(root?.metadata?.sourceChunkId).toBe("c1")
    expect(root?.metadata?.entityType).toBe("concept")
    expect(root?.metadata?.description).toBe("Root entity")
  })

  it("preserves confidence on every edge", () => {
    const graph = toGraph({
      root: rootEntity,
      relations: [
        {
          id: "r1",
          tenant_id: "t1",
          source_entity_id: "root",
          target_entity_id: "a",
          relationship_type: "uses",
          confidence: 0.123,
          properties: {},
          source_chunk_id: null,
          created_at: "",
        },
      ],
      neighbors: [neighborA],
    })
    const edge = graph.edges.find((e) => e.id === "r1")
    expect(edge?.metadata?.confidence).toBe(0.123)
    expect(edge?.metadata?.sourceChunkId).toBeNull()
    expect(edge?.metadata?.relationshipType).toBe("uses")
  })

  it("places the root at the origin (position [0,0,0])", () => {
    const graph = toGraph({
      root: rootEntity,
      relations: [],
      neighbors: [neighborA],
    })
    const root = graph.nodes.find((n) => n.id === "root")
    expect(root?.position).toEqual([0, 0, 0])
  })

  it("places neighbors in a radial spread (non-zero position)", () => {
    const graph = toGraph({
      root: rootEntity,
      relations: [],
      neighbors: [neighborA],
    })
    const a = graph.nodes.find((n) => n.id === "a")
    expect(a?.position).not.toEqual([0, 0, 0])
  })

  it("deduplicates the root appearing in both the entity and the neighbors list", () => {
    const graph = toGraph({
      root: rootEntity,
      relations: [],
      neighbors: [
        {
          id: "root",
          name: "Root (dup)",
          entity_type: "concept",
          description: "",
          canonical_id: null,
          source_chunk_id: null,
        },
      ],
    })
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0]?.id).toBe("root")
  })
})

describe("searchToGraph", () => {
  it("maps a search response into a graph with the matching entities + relations", () => {
    const response: KGSearchResponse = {
      query: "test",
      entities: [
        {
          id: "e1",
          name: "E1",
          entity_type: "concept",
          description: "",
          canonical_id: null,
          source_chunk_id: null,
        },
        {
          id: "e2",
          name: "E2",
          entity_type: "concept",
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
          relationship_type: "uses",
          confidence: 0.5,
          source_chunk_id: null,
        },
      ],
    }
    const graph = searchToGraph(response)
    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges).toHaveLength(1)
  })

  it("drops relations whose endpoints aren't in the search entities", () => {
    const response: KGSearchResponse = {
      query: "test",
      entities: [
        {
          id: "e1",
          name: "E1",
          entity_type: "concept",
          description: "",
          canonical_id: null,
          source_chunk_id: null,
        },
      ],
      relationships: [
        {
          id: "r1",
          source_entity_id: "e1",
          target_entity_id: "missing",
          relationship_type: "uses",
          confidence: 0.5,
          source_chunk_id: null,
        },
      ],
    }
    const graph = searchToGraph(response)
    expect(graph.edges).toHaveLength(0)
  })
})

describe("adapter determinism", () => {
  it("produces the same layout for the same entity set across calls", () => {
    const a = toGraph({
      root: rootEntity,
      relations: [],
      neighbors: [neighborA],
    })
    const b = toGraph({
      root: rootEntity,
      relations: [],
      neighbors: [neighborA],
    })
    expect(a.nodes.map((n) => n.position)).toEqual(b.nodes.map((n) => n.position))
  })
})
