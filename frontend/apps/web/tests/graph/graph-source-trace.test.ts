/**
 * Graph — source-traceability regression tests.
 *
 * **F6 Part 4.** The F6 definition of done
 * is the chain:
 *
 *   Entity → Relation → source chunk →
 *   source document → existing document detail
 *
 * This file pins the parts of that chain we
 * can verify in unit tests:
 *
 *   - **Backend provenance is preserved
 *     through the adapter.** ``source_chunk_id``
 *     and ``canonical_id`` survive the API →
 *     rendering translation.
 *   - **The "View source document" affordance
 *     uses the existing F3 drawer.** No second
 *     document viewer is created. The
 *     ``openSourceDocument`` helper delegates
 *     to ``documentSelectionStore.openDetail``.
 *   - **Switching between entities never opens
 *     the wrong document.** The detail panel
 *     reads the entity that's currently
 *     selected; opening a different entity
 *     updates the source.
 *   - **A relation carries its own
 *     ``source_chunk_id`` independently of the
 *     entity's.** The detail panel can show
 *     "this edge came from this chunk" even
 *     when the entity is from a different
 *     chunk.
 *
 * The visual / Playwright side of source-
 * traceability (clicking the source button +
 * asserting the right document opens) is a
 * F6 Part 4 Playwright E2E flow.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  documentSelectionStore,
  useDocumentSelectionStore,
} from "@/components/documents/DocumentSelectionStore"
import { toGraph } from "@/components/graph/adapters/kg-to-graph"
import { openSourceDocument } from "@/components/graph/graph-node-detail"
import type { GraphData, GraphNode } from "@/components/graph/types"
import type { KGEntity, KGRelationship } from "@/types/kg"

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeEntity(
  id: string,
  sourceChunkId: string | null,
  canonicalId: string | null = null,
): KGEntity {
  return {
    id,
    tenant_id: "tenant-1",
    name: `Entity ${id}`,
    entity_type: "concept",
    description: `Description for ${id}`,
    properties: {},
    canonical_id: canonicalId,
    source_chunk_id: sourceChunkId,
    created_at: "2026-01-01T00:00:00Z",
  }
}

function makeNeighbor(
  id: string,
  sourceChunkId: string | null,
): {
  id: string
  name: string
  entity_type: string
  description: string
  canonical_id: string | null
  source_chunk_id: string | null
} {
  return {
    id,
    name: `Neighbor ${id}`,
    entity_type: "concept",
    description: "",
    canonical_id: null,
    source_chunk_id: sourceChunkId,
  }
}

function makeRelationship(
  id: string,
  source: string,
  target: string,
  sourceChunkId: string | null,
): KGRelationship {
  return {
    id,
    tenant_id: "tenant-1",
    source_entity_id: source,
    target_entity_id: target,
    relationship_type: "mentions",
    confidence: 0.92,
    properties: {},
    source_chunk_id: sourceChunkId,
    created_at: "2026-01-01T00:00:00Z",
  }
}

function findNode(graph: GraphData, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id)
}

// ---------------------------------------------------------------------------
// Adapter — backend provenance preservation
// ---------------------------------------------------------------------------

describe("source-traceability (F6 Part 4)", () => {
  describe("adapter — backend provenance preservation", () => {
    it("preserves source_chunk_id on the root node", () => {
      const root = makeEntity("root", "chunk-1")
      const result = toGraph({ root, relations: [], neighbors: [] })
      const rootNode = findNode(result, "root")
      expect(rootNode?.metadata?.sourceChunkId).toBe("chunk-1")
    })

    it("preserves canonical_id on the root node", () => {
      const root = makeEntity("root", null, "canonical-1")
      const result = toGraph({ root, relations: [], neighbors: [] })
      const rootNode = findNode(result, "root")
      expect(rootNode?.metadata?.canonicalId).toBe("canonical-1")
    })

    it("preserves source_chunk_id on a neighbor", () => {
      const root = makeEntity("root", "chunk-1")
      const result = toGraph({
        root,
        relations: [],
        neighbors: [makeNeighbor("n1", "chunk-7")],
      })
      const n1 = findNode(result, "n1")
      expect(n1?.metadata?.sourceChunkId).toBe("chunk-7")
    })

    it("preserves source_chunk_id on a relationship", () => {
      const root = makeEntity("root", "chunk-1")
      const result = toGraph({
        root,
        relations: [makeRelationship("r1", "root", "n1", "chunk-99")],
        neighbors: [makeNeighbor("n1", "chunk-7")],
      })
      const edge = result.edges.find((e) => e.id === "r1")
      expect(edge?.metadata?.sourceChunkId).toBe("chunk-99")
    })

    it("preserves the LLM confidence on a relationship", () => {
      const root = makeEntity("root", "chunk-1")
      const result = toGraph({
        root,
        relations: [makeRelationship("r1", "root", "n1", "chunk-99")],
        neighbors: [makeNeighbor("n1", "chunk-7")],
      })
      const edge = result.edges.find((e) => e.id === "r1")
      // The adapter must propagate confidence
      // so the detail panel can render the
      // "92.0%" badge.
      expect(edge?.metadata?.confidence).toBe(0.92)
    })

    it("null source_chunk_id is preserved (not dropped or coerced)", () => {
      const root = makeEntity("root", null)
      const result = toGraph({ root, relations: [], neighbors: [] })
      const rootNode = findNode(result, "root")
      // The detail panel renders a "Source
      // chunk" section only when this is
      // non-null; the adapter must NOT
      // silently drop it.
      expect(rootNode?.metadata?.sourceChunkId).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // Source-document click-through — openSourceDocument
  // -----------------------------------------------------------------------

  describe("source-document click-through", () => {
    beforeEach(() => {
      useDocumentSelectionStore.getState().reset()
    })

    afterEach(() => {
      useDocumentSelectionStore.getState().reset()
    })

    it("openSourceDocument delegates to the F3 documentSelectionStore", () => {
      openSourceDocument("doc-1")
      const state = useDocumentSelectionStore.getState()
      expect(state.selectedId).toBe("doc-1")
      expect(state.isOpen).toBe(true)
    })

    it("openSourceDocument via the imperative handle also opens the drawer", () => {
      documentSelectionStore.openDetail("doc-2")
      const state = useDocumentSelectionStore.getState()
      expect(state.selectedId).toBe("doc-2")
      expect(state.isOpen).toBe(true)
    })

    it("switching from one document to another updates the selection (no stale state)", () => {
      openSourceDocument("doc-1")
      expect(useDocumentSelectionStore.getState().selectedId).toBe("doc-1")
      openSourceDocument("doc-2")
      expect(useDocumentSelectionStore.getState().selectedId).toBe("doc-2")
    })

    it("closing the drawer clears the selection (the next open starts clean)", () => {
      openSourceDocument("doc-1")
      documentSelectionStore.closeDetail()
      const state = useDocumentSelectionStore.getState()
      expect(state.selectedId).toBeNull()
      expect(state.isOpen).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // Switching between entities — no cross-contamination
  // -----------------------------------------------------------------------

  describe("switching entities — no cross-contamination", () => {
    it("the adapter output for entity A doesn't leak into entity B's graph", () => {
      const rootA = makeEntity("a", "chunk-a")
      const rootB = makeEntity("b", "chunk-b")
      const graphA = toGraph({
        root: rootA,
        relations: [makeRelationship("r-a", "a", "n-a", "chunk-a-2")],
        neighbors: [makeNeighbor("n-a", "chunk-a-3")],
      })
      const graphB = toGraph({
        root: rootB,
        relations: [makeRelationship("r-b", "b", "n-b", "chunk-b-2")],
        neighbors: [makeNeighbor("n-b", "chunk-b-3")],
      })
      // Graph A carries chunk-a-* ids; graph B
      // carries chunk-b-* ids. They don't share
      // any source provenance.
      const aChunkIds = new Set<string>()
      const aNodes = graphA.nodes
      for (const n of aNodes) {
        if (n.metadata?.sourceChunkId) aChunkIds.add(n.metadata.sourceChunkId)
      }
      for (const e of graphA.edges) {
        if (e.metadata?.sourceChunkId) aChunkIds.add(e.metadata.sourceChunkId)
      }
      expect(aChunkIds.has("chunk-b")).toBe(false)
      expect(aChunkIds.has("chunk-b-2")).toBe(false)
      expect(aChunkIds.has("chunk-b-3")).toBe(false)
      // And the inverse: graph B doesn't
      // mention chunk-a.
      const bChunkIds = new Set<string>()
      for (const n of graphB.nodes) {
        if (n.metadata?.sourceChunkId) bChunkIds.add(n.metadata.sourceChunkId)
      }
      for (const e of graphB.edges) {
        if (e.metadata?.sourceChunkId) bChunkIds.add(e.metadata.sourceChunkId)
      }
      expect(bChunkIds.has("chunk-a")).toBe(false)
      expect(bChunkIds.has("chunk-a-2")).toBe(false)
      expect(bChunkIds.has("chunk-a-3")).toBe(false)
    })

    it("two entities from the same chunk share the chunk id (correct provenance)", () => {
      // The source-chunk FK is the same for
      // both entities because they were
      // extracted from the same chunk. The
      // adapter must preserve this — the
      // detail panel will then render the
      // same source chunk id for both.
      const rootA = makeEntity("a", "shared-chunk")
      const rootB = makeEntity("b", "shared-chunk")
      const graphA = toGraph({ root: rootA, relations: [], neighbors: [] })
      const graphB = toGraph({ root: rootB, relations: [], neighbors: [] })
      expect(findNode(graphA, "a")?.metadata?.sourceChunkId).toBe("shared-chunk")
      expect(findNode(graphB, "b")?.metadata?.sourceChunkId).toBe("shared-chunk")
    })
  })
})
