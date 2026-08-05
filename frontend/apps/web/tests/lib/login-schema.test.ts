/**
 * Login form schema validation (F2 Part 1).
 *
 * Tests the Zod schema exported by
 * `lib/auth/login.schema.ts`. The schema is the
 * source of truth for the login form; the page
 * and form both consume it via React Hook Form's
 * `zodResolver`.
 */
import { describe, expect, it } from "vitest"

import { loginSchema } from "@/lib/auth/login.schema"

describe("login schema", () => {
  it("accepts a valid payload", () => {
    const result = loginSchema.safeParse({
      tenant_slug: "acme",
      email: "owner@acme.com",
      password: "TestPass!2345",
    })
    expect(result.success).toBe(true)
  })

  it("lowercases the tenant_slug on the way in", () => {
    const result = loginSchema.safeParse({
      tenant_slug: "ACME",
      email: "owner@acme.com",
      password: "x",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tenant_slug).toBe("acme")
    }
  })

  it("rejects empty tenant_slug", () => {
    const result = loginSchema.safeParse({
      tenant_slug: "",
      email: "owner@acme.com",
      password: "x",
    })
    expect(result.success).toBe(false)
  })

  it("rejects uppercase / special chars in tenant_slug", () => {
    const result = loginSchema.safeParse({
      tenant_slug: "Acme_Corp",
      email: "owner@acme.com",
      password: "x",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      tenant_slug: "acme",
      email: "not-an-email",
      password: "x",
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      tenant_slug: "acme",
      email: "owner@acme.com",
      password: "",
    })
    expect(result.success).toBe(false)
  })

  it("trims whitespace from the email + slug", () => {
    const result = loginSchema.safeParse({
      tenant_slug: "  acme  ",
      email: "  owner@acme.com  ",
      password: "x",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tenant_slug).toBe("acme")
      expect(result.data.email).toBe("owner@acme.com")
    }
  })
})
