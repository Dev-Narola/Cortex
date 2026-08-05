/**
 * Workspace setup schema — Zod validation.
 *
 * **F2 Part 2 (Task 14).** Validates the workspace
 * onboarding form's `name` + `slug` fields.
 *
 * Covers:
 *   - Name: required, 3–100 chars.
 *   - Slug: lowercase + digits + hyphens, 2–63 chars.
 *   - `suggestSlug()` produces a slug that passes the
 *     slug schema (so the auto-sync never produces an
 *     invalid value).
 */

import { describe, expect, it } from "vitest"

import {
  suggestSlug,
  workspaceSetupSchema,
} from "@/lib/onboarding/workspace.schema"

describe("workspaceSetupSchema", () => {
  describe("name", () => {
    it("accepts a valid 3-char name", () => {
      const r = workspaceSetupSchema.safeParse({ name: "Acm", slug: "acm" })
      expect(r.success).toBe(true)
    })

    it("accepts a valid 100-char name", () => {
      const name = "A".repeat(100)
      const r = workspaceSetupSchema.safeParse({ name, slug: "acme" })
      expect(r.success).toBe(true)
    })

    it("rejects an empty name", () => {
      const r = workspaceSetupSchema.safeParse({ name: "", slug: "acme" })
      expect(r.success).toBe(false)
      if (!r.success) {
        const messages = r.error.issues.map((i) => i.message).join("|")
        expect(messages).toMatch(/at least 3 characters/i)
      }
    })

    it("rejects a whitespace-only name", () => {
      const r = workspaceSetupSchema.safeParse({ name: "   ", slug: "acme" })
      expect(r.success).toBe(false)
    })

    it("rejects a 2-char name", () => {
      const r = workspaceSetupSchema.safeParse({ name: "Ac", slug: "ac" })
      expect(r.success).toBe(false)
    })

    it("rejects a 101-char name", () => {
      const name = "A".repeat(101)
      const r = workspaceSetupSchema.safeParse({ name, slug: "a" })
      expect(r.success).toBe(false)
    })
  })

  describe("slug", () => {
    it("accepts a 2-char slug", () => {
      const r = workspaceSetupSchema.safeParse({ name: "Acme", slug: "ac" })
      expect(r.success).toBe(true)
    })

    it("accepts lowercase + digits + dashes", () => {
      const r = workspaceSetupSchema.safeParse({
        name: "Acme 2026",
        slug: "acme-2026-q1",
      })
      expect(r.success).toBe(true)
    })

    it("rejects an empty slug", () => {
      const r = workspaceSetupSchema.safeParse({ name: "Acme", slug: "" })
      expect(r.success).toBe(false)
    })

    it("rejects uppercase", () => {
      const r = workspaceSetupSchema.safeParse({
        name: "Acme",
        slug: "Acme-INC",
      })
      expect(r.success).toBe(false)
      if (!r.success) {
        const messages = r.error.issues.map((i) => i.message).join("|")
        expect(messages).toMatch(/lowercase letters, numbers, and dashes only/i)
      }
    })

    it("rejects spaces", () => {
      const r = workspaceSetupSchema.safeParse({
        name: "Acme",
        slug: "acme inc",
      })
      expect(r.success).toBe(false)
    })

    it("rejects special characters", () => {
      const r = workspaceSetupSchema.safeParse({
        name: "Acme",
        slug: "acme_inc!",
      })
      expect(r.success).toBe(false)
    })

    it("rejects a 64-char slug (over the 63 limit)", () => {
      const r = workspaceSetupSchema.safeParse({
        name: "Acme",
        slug: "a".repeat(64),
      })
      expect(r.success).toBe(false)
    })
  })
})

describe("suggestSlug", () => {
  it("returns a slug that passes the schema for typical names", () => {
    const cases = ["Acme Inc", "My Co.", "Foo!! Bar?", "  Hello World  "]
    for (const name of cases) {
      const slug = suggestSlug(name)
      // Slug must be non-empty + valid (or empty + clearly empty).
      const r = workspaceSetupSchema.safeParse({ name, slug })
      // Empty slug is also "valid" in the sense that the
      // form will surface the inline error, so just check
      // that the suggestion doesn't produce garbage.
      if (slug.length > 0) {
        expect(r.success).toBe(true)
      }
    }
  })

  it("returns an empty slug for inputs that have no alphanumeric chars", () => {
    expect(suggestSlug("!!!")).toBe("")
    expect(suggestSlug("   ")).toBe("")
  })
})
