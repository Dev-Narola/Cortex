/**
 * invite-member-schema — F7 Part 1.
 *
 * Pins the Zod validation contract:
 *   - email is required + valid email format
 *   - role is one of admin / member / viewer
 *   - `owner` is deliberately NOT in the invite
 *     selector (per the PRD — owner is set at tenant
 *     creation, not through the invite form)
 *   - whitespace-only email is rejected
 */

import { describe, expect, it } from "vitest"

import {
  INVITABLE_ROLES,
  inviteMemberSchema,
} from "@/components/settings/team/invite-member-schema"

describe("inviteMemberSchema (F7 Part 1 Task 22-24)", () => {
  it("accepts a valid email + role", () => {
    const result = inviteMemberSchema.safeParse({
      email: "ada@example.com",
      role: "admin",
    })
    expect(result.success).toBe(true)
  })

  it("trims leading / trailing whitespace from the email before validating", () => {
    const result = inviteMemberSchema.safeParse({
      email: "  ada@example.com  ",
      role: "member",
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe("ada@example.com")
    }
  })

  it("rejects an empty email", () => {
    const result = inviteMemberSchema.safeParse({ email: "", role: "member" })
    expect(result.success).toBe(false)
  })

  it("rejects a whitespace-only email", () => {
    const result = inviteMemberSchema.safeParse({ email: "   ", role: "member" })
    expect(result.success).toBe(false)
  })

  it("rejects a malformed email", () => {
    const result = inviteMemberSchema.safeParse({ email: "not-an-email", role: "member" })
    expect(result.success).toBe(false)
  })

  it("rejects an unknown role", () => {
    const result = inviteMemberSchema.safeParse({
      email: "ada@example.com",
      // Intentional cast: the schema is the
      // source of truth on what's accepted.
      role: "owner" as never,
    })
    expect(result.success).toBe(false)
  })

  it("INVITABLE_ROLES exposes exactly admin / member / viewer", () => {
    expect(new Set(INVITABLE_ROLES)).toEqual(new Set(["admin", "member", "viewer"]))
  })

  it("accepts all three invitable roles", () => {
    for (const role of INVITABLE_ROLES) {
      const result = inviteMemberSchema.safeParse({
        email: "ada@example.com",
        role,
      })
      expect(result.success).toBe(true)
    }
  })
})
