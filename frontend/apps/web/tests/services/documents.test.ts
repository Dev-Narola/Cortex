/**
 * Documents service — F3 Part 2 (Task 12).
 *
 * Verifies the api-client wrapper for `GET /documents`
 * + `GET /documents/{id}`. We mock the api-client
 * singleton so the tests don't depend on the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getApiClient, resetApiClient } from "@/lib/auth/api-client"
import { getDocument, getDocuments } from "@/services/documents"

vi.mock("@/lib/auth/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/api-client")>(
      "@/lib/auth/api-client",
    )
  return {
    ...actual,
    getApiClient: vi.fn(),
    resetApiClient: vi.fn(),
  }
})

const getApiClientMock = vi.mocked(getApiClient)

describe("services/documents", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("getDocuments", () => {
    it("calls GET /api/v1/documents with no query when called with no params", async () => {
      const get = vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      })
      getApiClientMock.mockReturnValue({ get } as never)

      const result = await getDocuments()

      expect(get).toHaveBeenCalledWith("/api/v1/documents")
      expect(result).toEqual({ items: [], total: 0, limit: 50, offset: 0 })
    })

    it("builds the limit/offset/status query string when provided", async () => {
      const get = vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 25,
        offset: 50,
      })
      getApiClientMock.mockReturnValue({ get } as never)

      await getDocuments({ limit: 25, offset: 50, status: "indexed" })

      const calledPath = get.mock.calls[0][0]
      expect(calledPath).toMatch(/^\/api\/v1\/documents\?/)
      // URLSearchParams encodes the keys deterministically;
      // assert the substring the way the api-client will see it.
      expect(calledPath).toContain("limit=25")
      expect(calledPath).toContain("offset=50")
      expect(calledPath).toContain("status=indexed")
    })

    it("omits undefined params from the query string", async () => {
      const get = vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      })
      getApiClientMock.mockReturnValue({ get } as never)

      await getDocuments({ limit: 10 })

      const calledPath = get.mock.calls[0][0]
      expect(calledPath).toBe("/api/v1/documents?limit=10")
      expect(calledPath).not.toContain("offset=")
      expect(calledPath).not.toContain("status=")
    })

    it("propagates api-client errors", async () => {
      const get = vi.fn().mockRejectedValue(new Error("boom"))
      getApiClientMock.mockReturnValue({ get } as never)

      await expect(getDocuments()).rejects.toThrow("boom")
    })
  })

  describe("getDocument", () => {
    it("calls GET /api/v1/documents/{id} with the encoded id", async () => {
      const get = vi.fn().mockResolvedValue({
        id: "doc-1",
        title: "x",
        mime_type: "text/plain",
        status: "indexed",
        created_at: "2025-01-01T00:00:00Z",
      })
      getApiClientMock.mockReturnValue({ get } as never)

      await getDocument("doc-1")

      expect(get).toHaveBeenCalledWith("/api/v1/documents/doc-1")
    })

    it("URL-encodes ids with special characters", async () => {
      const get = vi.fn().mockResolvedValue({ id: "a/b" })
      getApiClientMock.mockReturnValue({ get } as never)

      await getDocument("a/b")

      expect(get).toHaveBeenCalledWith("/api/v1/documents/a%2Fb")
    })
  })
})
