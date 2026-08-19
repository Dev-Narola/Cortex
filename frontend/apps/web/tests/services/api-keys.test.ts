/**
 * api-keys service — F7 Part 2.
 *
 * Pins the URL contract (Task 1 — "Do not
 * invent request/response shapes"). Every test
 * here is a URL-pinning test: the api-client
 * must be called with the documented path.
 *
 * The api-client is mocked at the seam.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { createApiKey, listApiKeys, revokeApiKey } from "@/services/api-keys"

const getMock = vi.fn()
const postMock = vi.fn()
const deleteMock = vi.fn()

vi.mock("@/lib/auth/api-client", () => ({
  getApiClient: () => ({ get: getMock, post: postMock, delete: deleteMock }),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe("listApiKeys", () => {
  it("calls GET /api/v1/api-keys with the default query", async () => {
    getMock.mockResolvedValueOnce([])
    await listApiKeys()
    expect(getMock).toHaveBeenCalledWith("/api/v1/api-keys", expect.objectContaining({}))
  })

  it("forwards include_revoked=true when supplied", async () => {
    getMock.mockResolvedValueOnce([])
    await listApiKeys({ include_revoked: true })
    expect(getMock).toHaveBeenCalledWith(
      "/api/v1/api-keys",
      expect.objectContaining({
        query: { include_revoked: true },
      }),
    )
  })
})

describe("createApiKey", () => {
  it("calls POST /api/v1/api-keys with the name + scopes", async () => {
    postMock.mockResolvedValueOnce({
      id: "k-1",
      tenant_id: "t-1",
      name: "CI Pipeline",
      scopes: [],
      last_used_at: null,
      revoked_at: null,
      created_at: "2026-08-19T00:00:00Z",
      raw_key: "cx_live_TESTONLY",
    })
    await createApiKey({ name: "CI Pipeline" })
    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/api-keys",
      { name: "CI Pipeline" },
      expect.objectContaining({}),
    )
  })
})

describe("revokeApiKey", () => {
  it("calls DELETE /api/v1/api-keys/{id}", async () => {
    deleteMock.mockResolvedValueOnce({
      id: "k-1",
      tenant_id: "t-1",
      name: "CI Pipeline",
      scopes: [],
      last_used_at: null,
      revoked_at: "2026-08-19T00:00:00Z",
      created_at: "2026-08-19T00:00:00Z",
    })
    await revokeApiKey({ id: "k-1" })
    expect(deleteMock).toHaveBeenCalledWith("/api/v1/api-keys/k-1", expect.objectContaining({}))
  })
})
