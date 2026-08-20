/**
 * Demo data — F8 Part 4.
 *
 * Tests the seeded demo entries:
 *   - There are 3 demo entries (matching
 *     the 3 feature beats: hybrid-search,
 *     knowledge-graph, citations).
 *   - Each entry has the right shape
 *     (chipLabel, question, answer,
 *     citations).
 *   - The `{{citation:N}}` placeholders
 *     are valid (the index N exists in
 *     the entry's citations array).
 *   - The `getSeededDemo` lookup works for
 *     exact matches, substring matches,
 *     and trimmed input.
 *   - The `parseAnswer` helper splits the
 *     answer into text + citation segments
 *     at the right boundaries.
 *   - The source name is fictional (no
 *     real internal project files).
 */

import { describe, expect, it } from "vitest"

import {
  DEMO_ENTRIES,
  getSeededDemo,
  parseAnswer,
} from "@/components/marketing/demo/demo-data"

describe("DEMO_ENTRIES", () => {
  it("has 3 seeded entries (one per feature beat)", () => {
    expect(DEMO_ENTRIES).toHaveLength(3)
  })

  it("each entry has a chipLabel, question, answer, and citations", () => {
    for (const entry of DEMO_ENTRIES) {
      expect(entry.id).toBeTruthy()
      expect(entry.chipLabel.length).toBeGreaterThan(0)
      expect(entry.question.length).toBeGreaterThan(0)
      expect(entry.answer.length).toBeGreaterThan(0)
      expect(entry.citations.length).toBeGreaterThan(0)
    }
  })

  it("each citation in an entry has the right shape", () => {
    for (const entry of DEMO_ENTRIES) {
      for (const c of entry.citations) {
        expect(c.id).toBeTruthy()
        expect(c.index).toBeGreaterThan(0)
        expect(c.documentTitle).toBeTruthy()
        expect(c.location.length).toBeGreaterThan(0)
        expect(c.excerpt.length).toBeGreaterThan(0)
      }
    }
  })

  it("every `{{citation:N}}` placeholder references a real citation index", () => {
    for (const entry of DEMO_ENTRIES) {
      const placeholders = [
        ...entry.answer.matchAll(/\{\{citation:(\d+)\}\}/g),
      ]
      for (const m of placeholders) {
        const index = Number.parseInt(m[1] ?? "0", 10)
        const found = entry.citations.find((c) => c.index === index)
        expect(found, `entry=${entry.id} missing citation ${index}`).toBeDefined()
      }
    }
  })

  it("uses fictional source names — NOT internal Cortex project files", () => {
    // Per the F8 spec: "Don't expose
    // internal project files... Use
    // fictional/neutral sample source
    // names."
    for (const entry of DEMO_ENTRIES) {
      for (const c of entry.citations) {
        const lc = c.documentTitle.toLowerCase()
        for (const internal of [
          "cortex-prd",
          "cortex-engineering-blueprint",
          "database.md",
          "ui-ux.md",
          "frontend-roadmap",
        ]) {
          expect(lc).not.toContain(internal)
        }
      }
    }
  })

  it("each entry's question is Cortex-specific (no generic 'weather today')", () => {
    for (const entry of DEMO_ENTRIES) {
      const q = entry.question.toLowerCase()
      // Each question must mention at
      // least one Cortex-relevant term.
      const hasCortexTerm = [
        "cortex",
        "hybrid",
        "graph",
        "citation",
        "traceable",
        "entities",
        "source",
        "search",
      ].some((t) => q.includes(t))
      expect(hasCortexTerm, `entry=${entry.id} question not Cortex-specific`).toBe(true)
    }
  })
})

describe("getSeededDemo", () => {
  it("returns the matching entry on exact match", () => {
    const entry = getSeededDemo(DEMO_ENTRIES[0]!.question)
    expect(entry?.id).toBe(DEMO_ENTRIES[0]!.id)
  })

  it("handles trimmed + case-insensitive input", () => {
    const entry = getSeededDemo(`  ${DEMO_ENTRIES[0]!.question.toUpperCase()}  `)
    expect(entry?.id).toBe(DEMO_ENTRIES[0]!.id)
  })

  it("returns the first entry on substring match (defensive fallback)", () => {
    // The visitor may tweak the question
    // text — we still resolve to a sensible
    // demo. The spec is explicit: "the demo
    // should always function end-to-end."
    const entry = getSeededDemo("How does")
    expect(entry).not.toBeNull()
  })

  it("returns null on empty input", () => {
    expect(getSeededDemo("")).toBeNull()
    expect(getSeededDemo("   ")).toBeNull()
  })
})

describe("parseAnswer", () => {
  it("splits text + citation segments at the placeholders", () => {
    const segments = parseAnswer("Hello {{citation:1}} world {{citation:2}}!")
    expect(segments).toEqual([
      { kind: "text", value: "Hello " },
      { kind: "citation", id: "citation-1", index: 1 },
      { kind: "text", value: " world " },
      { kind: "citation", id: "citation-2", index: 2 },
      { kind: "text", value: "!" },
    ])
  })

  it("handles answers with no placeholders", () => {
    const segments = parseAnswer("Just plain text.")
    expect(segments).toEqual([{ kind: "text", value: "Just plain text." }])
  })

  it("handles answers that start with a citation", () => {
    const segments = parseAnswer("{{citation:1}} starts here.")
    expect(segments).toEqual([
      { kind: "citation", id: "citation-1", index: 1 },
      { kind: "text", value: " starts here." },
    ])
  })

  it("handles answers that end with a citation", () => {
    const segments = parseAnswer("Ends with {{citation:1}}")
    expect(segments).toEqual([
      { kind: "text", value: "Ends with " },
      { kind: "citation", id: "citation-1", index: 1 },
    ])
  })
})
