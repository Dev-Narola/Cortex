/**
 * Audit service — endpoint URL pinning.
 *
 * F7 Part 5. The `services/audit` module
 * hits one tenant-scoped endpoint:
 *
 *   GET /api/v1/audit-log
 *
 * **Why this test exists.** A future
 * contract drift (e.g. someone re-paths
 * the endpoint to `/api/v1/admin/audit`
 * or uses the legacy admin route) should
 * trip a test here, not surface as a 404
 * in production.
 *
 * **Tenant scope.** The endpoint is
 * tenant-scoped at the backend; the
 * frontend must NEVER send a `tenant_id`
 * query param.
 *
 * **Immutability.** The service exposes
 * only `getAuditLog` — no `delete`,
 * `update`, `create`. The test asserts
 * the export surface.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getAuditLog, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from "@/services/audit"
import * as auditServiceExports from "@/services/audit"

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

describe("getAuditLog", () => {
  it("hits /api/v1/audit-log (the tenant-scoped route)", async () => {
    getMock.mockResolvedValueOnce({ items: [], next_cursor: null })
    await getAuditLog()
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/audit-log",
      expect.any(Object),
    )
  })

  it("does NOT send a tenant_id query param", async () => {
    getMock.mockResolvedValueOnce({ items: [], next_cursor: null })
    await getAuditLog()
    const opts = getMock.mock.calls[0]?.[1] as
      | { query?: Record<string, string | number> }
      | undefined
    expect(opts?.query ?? {}).not.toHaveProperty("tenant_id")
  })

  it("forwards the cursor as a query param when present", async () => {
    getMock.mockResolvedValueOnce({ items: [], next_cursor: null })
    await getAuditLog({ cursor: "opaque-cursor-token" })
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/audit-log",
      expect.objectContaining({
        query: expect.objectContaining({
          cursor: "opaque-cursor-token",
        }),
      }),
    )
  })

  it("forwards limit + action + resource_type as query params when present", async () => {
    getMock.mockResolvedValueOnce({ items: [], next_cursor: null })
    await getAuditLog({
      limit: 50,
      action: AUDIT_ACTIONS.DOCUMENT_DELETED,
      resource_type: AUDIT_RESOURCE_TYPES.DOCUMENT,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
    })
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/audit-log",
      expect.objectContaining({
        query: expect.objectContaining({
          limit: 50,
          action: AUDIT_ACTIONS.DOCUMENT_DELETED,
          resource_type: AUDIT_RESOURCE_TYPES.DOCUMENT,
          start_date: "2026-08-01",
          end_date: "2026-08-31",
        }),
      }),
    )
  })

  it("omits the query object when no params are provided", async () => {
    getMock.mockResolvedValueOnce({ items: [], next_cursor: null })
    await getAuditLog()
    const opts = getMock.mock.calls[0]?.[1] as
      | { query?: Record<string, string | number> }
      | undefined
    expect(opts?.query).toBeUndefined()
  })

  it("forwards the abort signal to the api-client", async () => {
    getMock.mockResolvedValueOnce({ items: [], next_cursor: null })
    const ac = new AbortController()
    await getAuditLog({ signal: ac.signal })
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/audit-log",
      expect.objectContaining({ signal: ac.signal }),
    )
  })
})

describe("services/audit — immutability surface (Tasks 29, 44)", () => {
  it("does NOT export a delete / update / patch / create helper", () => {
    // The audit pipeline is append-only at
    // the repository level. The frontend's
    // service barrel must mirror that: the
    // only mutation we'd allow is... none.
    // The barrel should not export anything
    // destructive.
    const exportNames = Object.keys(auditServiceExports)
    for (const name of exportNames) {
      // Defensive — if a future contributor
      // adds `deleteAuditEvent` or
      // `updateAuditEvent`, this test will
      // catch it.
      expect(name).not.toMatch(/delete/i)
      expect(name).not.toMatch(/update/i)
      expect(name).not.toMatch(/patch/i)
      expect(name).not.toMatch(/create/i)
      expect(name).not.toMatch(/clear/i)
      expect(name).not.toMatch(/append/i)
    }
  })
})
