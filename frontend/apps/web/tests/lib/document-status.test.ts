/**
 * Document status helpers — F3 Part 4 (Task 34 + 44).
 *
 * Covers the strict status union, the ordering
 * rule (for the "no stale regression" guarantee),
 * and the visual-progress map.
 */

import { describe, expect, it } from "vitest"

import {
  DOCUMENT_STATUSES,
  isDocumentStatus,
  isInFlight,
  shouldApplyStatus,
  statusLabel,
  statusOrder,
  statusProgress,
} from "@/lib/documents/status"

describe("status union", () => {
  it("exposes the canonical 6 statuses in order", () => {
    expect(DOCUMENT_STATUSES).toEqual([
      "pending",
      "parsing",
      "chunking",
      "embedding",
      "indexed",
      "failed",
    ])
  })

  it("isDocumentStatus narrows to the union", () => {
    expect(isDocumentStatus("parsing")).toBe(true)
    expect(isDocumentStatus("failed")).toBe(true)
    expect(isDocumentStatus("nope")).toBe(false)
    expect(isDocumentStatus(42)).toBe(false)
    expect(isDocumentStatus(null)).toBe(false)
  })
})

describe("statusOrder", () => {
  it("returns 0..4 for the happy path", () => {
    expect(statusOrder("pending")).toBe(0)
    expect(statusOrder("parsing")).toBe(1)
    expect(statusOrder("chunking")).toBe(2)
    expect(statusOrder("embedding")).toBe(3)
    expect(statusOrder("indexed")).toBe(4)
  })

  it("puts failed above the happy path (terminal)", () => {
    expect(statusOrder("failed")).toBe(5)
  })
})

describe("shouldApplyStatus (Task 44 — no stale regression)", () => {
  it("accepts the canonical progression", () => {
    expect(shouldApplyStatus("pending", "parsing")).toBe(true)
    expect(shouldApplyStatus("parsing", "chunking")).toBe(true)
    expect(shouldApplyStatus("chunking", "embedding")).toBe(true)
    expect(shouldApplyStatus("embedding", "indexed")).toBe(true)
  })

  it("rejects a stale happy-path event", () => {
    // already at embedding, a stale parsing
    // arrives — drop it.
    expect(shouldApplyStatus("embedding", "parsing")).toBe(false)
    expect(shouldApplyStatus("indexed", "chunking")).toBe(false)
  })

  it("always applies failed (it's terminal)", () => {
    expect(shouldApplyStatus("pending", "failed")).toBe(true)
    expect(shouldApplyStatus("parsing", "failed")).toBe(true)
    expect(shouldApplyStatus("embedding", "failed")).toBe(true)
    // Even after indexed — a re-ingestion can fail.
    expect(shouldApplyStatus("indexed", "failed")).toBe(true)
  })

  it("rejects a duplicate event (no change)", () => {
    expect(shouldApplyStatus("parsing", "parsing")).toBe(false)
    expect(shouldApplyStatus("indexed", "indexed")).toBe(false)
  })

  it("the spec's example: embedding displayed, stale parsing arrives → stay at embedding", () => {
    // current = embedding, next = parsing
    expect(shouldApplyStatus("embedding", "parsing")).toBe(false)
  })
})

describe("isInFlight", () => {
  it("returns true for pending/parsing/chunking/embedding", () => {
    expect(isInFlight("pending")).toBe(true)
    expect(isInFlight("parsing")).toBe(true)
    expect(isInFlight("chunking")).toBe(true)
    expect(isInFlight("embedding")).toBe(true)
  })

  it("returns false for terminal states", () => {
    expect(isInFlight("indexed")).toBe(false)
    expect(isInFlight("failed")).toBe(false)
  })
})

describe("statusLabel", () => {
  it("returns a human-readable label for every status", () => {
    expect(statusLabel("pending")).toBe("Pending")
    expect(statusLabel("indexed")).toBe("Indexed")
  })
})

describe("statusProgress", () => {
  it("maps each status to a visual percentage", () => {
    expect(statusProgress("pending")).toBe(0)
    expect(statusProgress("parsing")).toBe(25)
    expect(statusProgress("chunking")).toBe(50)
    expect(statusProgress("embedding")).toBe(75)
    expect(statusProgress("indexed")).toBe(100)
    expect(statusProgress("failed")).toBe(0)
  })
})
