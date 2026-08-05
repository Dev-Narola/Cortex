/**
 * Register form schema validation (F2 Part 1).
 */

import { describe, expect, it } from "vitest"

import { registerSchema } from "@/lib/auth/register.schema"

const validBase = {
  name: "Ada Lovelace",
  email: "ada@cortex.dev",
  password: "TestPass123",
  confirm_password: "TestPass123",
  accept_terms: true as const,
}

describe("register schema", () => {
  it("accepts a valid payload", () => {
    const result = registerSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })

  it("lowercases the email", () => {
    const result = registerSchema.safeParse({
      ...validBase,
      email: "Ada@Cortex.DEV",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe("ada@cortex.dev")
    }
  })

  it("rejects empty name", () => {
    const result = registerSchema.safeParse({ ...validBase, name: "" })
    expect(result.success).toBe(false)
  })

  it("rejects mismatched password confirmation", () => {
    const result = registerSchema.safeParse({
      ...validBase,
      confirm_password: "Different1",
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "confirm_password")
      expect(issue?.message).toBe("Passwords don't match")
    }
  })

  it("rejects passwords missing a digit", () => {
    const result = registerSchema.safeParse({
      ...validBase,
      password: "TestPassWord",
      confirm_password: "TestPassWord",
    })
    expect(result.success).toBe(false)
  })

  it("rejects passwords missing an uppercase letter", () => {
    const result = registerSchema.safeParse({
      ...validBase,
      password: "testpass123",
      confirm_password: "testpass123",
    })
    expect(result.success).toBe(false)
  })

  it("rejects passwords shorter than 8 chars", () => {
    const result = registerSchema.safeParse({
      ...validBase,
      password: "Abc123",
      confirm_password: "Abc123",
    })
    expect(result.success).toBe(false)
  })

  it("rejects when terms are not accepted", () => {
    const result = registerSchema.safeParse({ ...validBase, accept_terms: false })
    expect(result.success).toBe(false)
  })
})
