/**
 * Tests for the env validation. The `publicEnv` is read at
 * module load; the `getServerEnv` helper is server-only.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

describe("publicEnv", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL

  afterEach(() => {
    if (originalApiUrl === undefined) {
      // biome-ignore lint/performance/noDelete: must remove the key so Zod's .default() kicks in
      delete process.env.NEXT_PUBLIC_API_URL
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl
    }
  })

  it("falls back to localhost when env is missing", async () => {
    // biome-ignore lint/performance/noDelete: must remove the key so Zod's .default() kicks in
    delete process.env.NEXT_PUBLIC_API_URL
    // Re-import fresh to pick up the cleared env.
    vi.resetModules()
    const mod = await import("@cortex/config")
    expect(mod.publicEnv.NEXT_PUBLIC_API_URL).toBe("http://localhost:8000")
  })
})
