/**
 * Tests for the env validation. The `publicEnv` is read at
 * module load; the `getServerEnv` helper is server-only.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("publicEnv", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  });

  it("falls back to localhost when env is missing", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    // Re-import fresh to pick up the cleared env.
    vi.resetModules();
    const mod = await import("@cortex/config");
    expect(mod.publicEnv.NEXT_PUBLIC_API_URL).toBe("http://localhost:8000");
  });
});

// Re-export vitest's `vi` so the dynamic-import test compiles.
import { vi } from "vitest";
