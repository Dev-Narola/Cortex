/**
 * Citation resolver — F4 Part 3 (Task 39).
 *
 * Covers:
 *   - Trust model (Task 40): the resolver
 *     filters streamed citations to the
 *     chunk ids the message explicitly
 *     records. Extra streamed entries
 *     never reach the UI.
 *   - Dedupe (Task 55): two streamed entries
 *     for the same chunk produce one
 *     citation.
 *   - Order (Task 68): numbering follows
 *     stream order, not array position
 *     after filtering.
 *   - Multiple citations (Task 54).
 *   - Empty case (Task 73).
 */

import { describe, expect, it } from "vitest"

import { resolveCitations } from "@/lib/chat/citation-resolver"
import type { Message } from "@/types/conversation"

function msg(retrievedChunkIds: string[]): Pick<Message, "id" | "retrievedChunkIds"> {
  return { id: "m-1", retrievedChunkIds }
}

const wire = (overrides: Partial<{
  documentId: string
  chunkId: string
  documentTitle: string
  chunkIndex: number
  score: number
  excerpt?: string
}> = {}) => ({
  documentId: overrides.documentId ?? "doc-1",
  chunkId: overrides.chunkId ?? "chunk-1",
  documentTitle: overrides.documentTitle ?? "Architecture document",
  chunkIndex: overrides.chunkIndex ?? 0,
  score: overrides.score ?? 0.9,
  excerpt: overrides.excerpt ?? "sample excerpt",
})

describe("resolveCitations (Task 39)", () => {
  it("returns [] when the message has no retrievedChunkIds (Task 73)", () => {
    const out = resolveCitations({
      message: msg([]),
      streamed: [wire({ chunkId: "chunk-1" })],
    })
    expect(out).toEqual([])
  })

  it("returns [] when no streamed citations arrived", () => {
    const out = resolveCitations({
      message: msg(["chunk-1"]),
      streamed: [],
    })
    expect(out).toEqual([])
  })

  it("maps streamed entries to numbered citations in stream order", () => {
    const out = resolveCitations({
      message: msg(["chunk-A", "chunk-B", "chunk-C"]),
      streamed: [
        wire({ chunkId: "chunk-A", documentTitle: "Doc A" }),
        wire({ chunkId: "chunk-B", documentTitle: "Doc B" }),
        wire({ chunkId: "chunk-C", documentTitle: "Doc C" }),
      ],
    })
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({
      index: 1,
      chunkId: "chunk-A",
      documentTitle: "Doc A",
    })
    expect(out[1]).toMatchObject({
      index: 2,
      chunkId: "chunk-B",
      documentTitle: "Doc B",
    })
    expect(out[2]).toMatchObject({
      index: 3,
      chunkId: "chunk-C",
      documentTitle: "Doc C",
    })
  })

  it("filters streamed citations NOT recorded on the message (Task 40)", () => {
    const out = resolveCitations({
      message: msg(["chunk-A"]),
      streamed: [
        wire({ chunkId: "chunk-A", documentTitle: "Real" }),
        wire({ chunkId: "chunk-X", documentTitle: "Not grounded" }),
      ],
    })
    expect(out).toHaveLength(1)
    expect(out[0]?.chunkId).toBe("chunk-A")
  })

  it("dedupes duplicate chunk ids from the stream (Task 55)", () => {
    const out = resolveCitations({
      message: msg(["chunk-A", "chunk-B"]),
      streamed: [
        wire({ chunkId: "chunk-A" }),
        wire({ chunkId: "chunk-A" }), // pathological duplicate
        wire({ chunkId: "chunk-B" }),
      ],
    })
    expect(out).toHaveLength(2)
    expect(out.map((c) => c.chunkId)).toEqual(["chunk-A", "chunk-B"])
    expect(out.map((c) => c.index)).toEqual([1, 2])
  })

  it("keeps duplicate-document chunks as separate citations (Task 55)", () => {
    const out = resolveCitations({
      message: msg(["chunk-1", "chunk-2"]),
      streamed: [
        wire({ chunkId: "chunk-1", documentId: "doc-1", chunkIndex: 0 }),
        wire({ chunkId: "chunk-2", documentId: "doc-1", chunkIndex: 1 }),
      ],
    })
    expect(out).toHaveLength(2)
    expect(out[0]?.documentId).toBe("doc-1")
    expect(out[1]?.documentId).toBe("doc-1")
    expect(out[0]?.chunkIndex).toBe(0)
    expect(out[1]?.chunkIndex).toBe(1)
  })

  it("assigns each citation a stable chunk-derived id", () => {
    const out = resolveCitations({
      message: msg(["chunk-A", "chunk-B"]),
      streamed: [
        wire({ chunkId: "chunk-A" }),
        wire({ chunkId: "chunk-B" }),
      ],
    })
    expect(out[0]?.id).toBe("citation:chunk-A")
    expect(out[1]?.id).toBe("citation:chunk-B")
  })
})
