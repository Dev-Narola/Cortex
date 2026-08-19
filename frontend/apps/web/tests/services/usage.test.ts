/**
 * Usage services — endpoint URL pinning.
 *
 * F7 Part 4. The `services/usage` module
 * hits three tenant-scoped endpoints:
 *
 *   - GET /api/v1/tenants/me/usage/summary
 *   - GET /api/v1/tenants/me/usage
 *   - GET /api/v1/tenants/me/usage/events
 *
 * **Why this test exists.** A future
 * contract drift (e.g. someone re-paths the
 * endpoint to `/api/v1/usage/summary` or
 * uses the admin route) should trip a test
 * here, not surface as a 404 in production.
 *
 * **Tenant scope.** The endpoint uses
 * `/me/` to make the tenant scope
 * explicit; the backend resolves the
 * tenant from the authenticated JWT. The
 * service must NEVER send a `tenant_id`
 * query param.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getTenantUsage,
  getTenantUsageEvents,
  getTenantUsageSummary,
} from "@/services/usage"

const getMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ get: getMock, post: vi.fn(), delete: vi.fn() }),
}))

beforeEach(() => {
  getMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("getTenantUsageSummary", () => {
  it("hits /api/v1/tenants/me/usage/summary", async () => {
    getMock.mockResolvedValueOnce({ period: { from: "", to: "" }, requests: 0 })
    await getTenantUsageSummary()
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/tenants/me/usage/summary",
      expect.any(Object),
    )
  })

  it("does NOT send a tenant_id query param", async () => {
    getMock.mockResolvedValueOnce({ period: { from: "", to: "" }, requests: 0 })
    await getTenantUsageSummary()
    const opts = getMock.mock.calls[0]?.[1] as { query?: Record<string, string> } | undefined
    expect(opts?.query ?? {}).not.toHaveProperty("tenant_id")
  })

  it("forwards an optional period_start + period_end as query params", async () => {
    getMock.mockResolvedValueOnce({ period: { from: "", to: "" }, requests: 0 })
    await getTenantUsageSummary({
      period_start: "2026-08-01T00:00:00Z",
      period_end: "2026-08-31T23:59:59Z",
    })
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/tenants/me/usage/summary",
      expect.objectContaining({
        query: expect.objectContaining({
          period_start: "2026-08-01T00:00:00Z",
          period_end: "2026-08-31T23:59:59Z",
        }),
      }),
    )
  })

  it("omits the query object when no period params are provided", async () => {
    getMock.mockResolvedValueOnce({ period: { from: "", to: "" }, requests: 0 })
    await getTenantUsageSummary()
    const opts = getMock.mock.calls[0]?.[1] as { query?: Record<string, string> } | undefined
    expect(opts?.query).toBeUndefined()
  })

  it("forwards the abort signal to the api-client", async () => {
    getMock.mockResolvedValueOnce({ period: { from: "", to: "" }, requests: 0 })
    const ac = new AbortController()
    await getTenantUsageSummary({ signal: ac.signal })
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/tenants/me/usage/summary",
      expect.objectContaining({ signal: ac.signal }),
    )
  })
})

describe("getTenantUsage", () => {
  it("hits /api/v1/tenants/me/usage (the aggregate)", async () => {
    getMock.mockResolvedValueOnce({ by_event: {} })
    await getTenantUsage()
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/tenants/me/usage",
      expect.any(Object),
    )
  })

  it("does NOT send a tenant_id query param", async () => {
    getMock.mockResolvedValueOnce({ by_event: {} })
    await getTenantUsage()
    const opts = getMock.mock.calls[0]?.[1] as { query?: Record<string, string> } | undefined
    expect(opts?.query ?? {}).not.toHaveProperty("tenant_id")
  })
})

describe("getTenantUsageEvents", () => {
  it("hits /api/v1/tenants/me/usage/events", async () => {
    getMock.mockResolvedValueOnce([])
    await getTenantUsageEvents()
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/tenants/me/usage/events",
      expect.any(Object),
    )
  })

  it("does NOT send a tenant_id query param", async () => {
    getMock.mockResolvedValueOnce([])
    await getTenantUsageEvents()
    const opts = getMock.mock.calls[0]?.[1] as { query?: Record<string, string> } | undefined
    expect(opts?.query ?? {}).not.toHaveProperty("tenant_id")
  })

  it("forwards limit + event_type as query params when provided", async () => {
    getMock.mockResolvedValueOnce([])
    await getTenantUsageEvents({ limit: 100, event_type: "embedding" })
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/tenants/me/usage/events",
      expect.objectContaining({
        query: expect.objectContaining({
          limit: 100,
          event_type: "embedding",
        }),
      }),
    )
  })
})
