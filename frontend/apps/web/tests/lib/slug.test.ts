/**
 * Slug helper — workspace name → URL handle.
 *
 * **F2 Part 2 (Task 14).** Pure helper, no I/O.
 * Covers:
 *   - Lower-cases.
 *   - Replaces non-`[a-z0-9]` with `-`.
 *   - Collapses runs of `-` into a single `-`.
 *   - Trims leading + trailing `-`.
 *   - Idempotent: slugify(slugify(x)) === slugify(x).
 *   - Empty / whitespace inputs return `""`.
 */

import { describe, expect, it } from "vitest"

import { slugify } from "@/lib/onboarding/slug"

describe("slugify", () => {
  it("lowercases the input", () => {
    expect(slugify("ACME")).toBe("acme")
  })

  it("keeps alphanumeric characters as-is", () => {
    expect(slugify("acme123")).toBe("acme123")
  })

  it("replaces spaces with a single dash", () => {
    expect(slugify("acme inc")).toBe("acme-inc")
  })

  it("replaces punctuation with dashes (no double-dashes)", () => {
    expect(slugify("Acme Workspace!!")).toBe("acme-workspace")
  })

  it("collapses runs of non-alphanumeric characters into one dash", () => {
    expect(slugify("a   b")).toBe("a-b")
    expect(slugify("a!@#b")).toBe("a-b")
  })

  it("trims leading and trailing dashes", () => {
    expect(slugify("--acme--")).toBe("acme")
    expect(slugify("!!!acme???")).toBe("acme")
  })

  it("returns an empty string for empty / whitespace input", () => {
    expect(slugify("")).toBe("")
    expect(slugify("   ")).toBe("")
    expect(slugify("!!!")).toBe("")
  })

  it("is idempotent", () => {
    expect(slugify(slugify("Acme Workspace!!"))).toBe(slugify("Acme Workspace!!"))
  })

  it("preserves digits", () => {
    expect(slugify("Cortex 2026 Q1")).toBe("cortex-2026-q1")
  })
})
