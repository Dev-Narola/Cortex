import { describe, expect, it } from "vitest"

import { filterDocuments } from "@/lib/documents/filter"

const docs = [
  { id: "a", title: "Beta notes.md", status: "indexed", created_at: "2026-10-02T00:00:00Z" },
  { id: "b", title: "alpha guide.pdf", status: "embedding", created_at: "2026-10-03T00:00:00Z" },
  { id: "c", title: "Gamma.txt", status: "failed", created_at: "2026-10-01T00:00:00Z" },
  { id: "d", title: "Delta.md", status: "pending", created_at: "2026-10-04T00:00:00Z" },
] as const

const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)

describe("filterDocuments", () => {
  it("defaults to newest first", () => {
    expect(ids(filterDocuments(docs, {}))).toEqual(["d", "b", "a", "c"])
  })
  it("groups every in-flight stage under processing", () => {
    expect(ids(filterDocuments(docs, { status: "processing" }))).toEqual(["d", "b"])
  })
  it("matches exact terminal states", () => {
    expect(ids(filterDocuments(docs, { status: "failed" }))).toEqual(["c"])
  })
  it("searches names case-insensitively and sorts by name or age", () => {
    expect(ids(filterDocuments(docs, { query: " ALPHA " }))).toEqual(["b"])
    expect(ids(filterDocuments(docs, { sort: "name" }))).toEqual(["b", "a", "d", "c"])
    expect(ids(filterDocuments(docs, { sort: "oldest" }))).toEqual(["c", "a", "b", "d"])
  })
  it("does not mutate its input", () => {
    const input = [...docs]
    filterDocuments(input, { sort: "name" })
    expect(ids(input)).toEqual(["a", "b", "c", "d"])
  })
})
