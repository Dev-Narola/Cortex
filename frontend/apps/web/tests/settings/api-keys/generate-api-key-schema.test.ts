/**
 * generate-api-key-schema — F7 Part 2.
 *
 * Pins the Zod contract:
 *   - name is required (1-255 chars)
 *   - whitespace is trimmed
 *   - the same form used by every other Settings
 *     form (matches the F7 Part 1
 *     invite-member-schema pattern)
 */

import { describe, expect, it } from "vitest"

import { generateApiKeySchema } from "@/components/settings/api-keys/generate-api-key-schema"

describe("generateApiKeySchema (F7 Part 2 Task 12)", () => {
  it("accepts a valid name", () => {
    const result = generateApiKeySchema.safeParse({ name: "CI Pipeline" })
    expect(result.success).toBe(true)
  })

  it("trims leading / trailing whitespace", () => {
    const result = generateApiKeySchema.safeParse({ name: "  My Key  " })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("My Key")
    }
  })

  it("rejects an empty name", () => {
    const result = generateApiKeySchema.safeParse({ name: "" })
    expect(result.success).toBe(false)
  })

  it("rejects a whitespace-only name", () => {
    const result = generateApiKeySchema.safeParse({ name: "   " })
    expect(result.success).toBe(false)
  })

  it("rejects names over 255 characters (mirrors backend's 1-255 cap)", () => {
    const result = generateApiKeySchema.safeParse({ name: "x".repeat(256) })
    expect(result.success).toBe(false)
  })

  it("accepts a name exactly at 255 characters", () => {
    const result = generateApiKeySchema.safeParse({ name: "x".repeat(255) })
    expect(result.success).toBe(true)
  })
})
