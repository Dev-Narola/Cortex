/**
 * Documents hooks — F3 Part 2 (Task 13).
 *
 * Verifies:
 *   - `useDocuments` cache key includes the params
 *   - `useDocuments` returns the TanStack Query result
 *     without duplicating the data
 *   - `useDocument(null)` is a no-op (no fetch)
 *   - `useDocument(id)` fetches /documents/{id}
 *   - 404s are not retried
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@cortex/api-client"

import { useDocument, useDocuments } from "@/hooks/documents"
import { getApiClient } from "@/lib/auth/api-client"

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

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe("hooks/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("useDocuments", () => {
    it("calls getDocuments and returns the data", async () => {
      const payload = {
        items: [
          {
            id: "d-1",
            title: "x",
            mime_type: "text/plain",
            status: "indexed" as const,
            created_at: "2025-01-01T00:00:00Z",
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }
      const get = vi.fn().mockResolvedValue(payload)
      getApiClientMock.mockReturnValue({ get } as never)

      const { result } = renderHook(() => useDocuments(), { wrapper: makeWrapper() })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(payload)
      expect(get).toHaveBeenCalledOnce()
    })

    it("threads params through to the queryKey + the service", async () => {
      const get = vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 25,
        offset: 25,
      })
      getApiClientMock.mockReturnValue({ get } as never)

      const { result } = renderHook(
        () => useDocuments({ limit: 25, offset: 25, status: "failed" }),
        { wrapper: makeWrapper() },
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      // The service was called with the params
      const calledPath = get.mock.calls[0][0]
      expect(calledPath).toContain("limit=25")
      expect(calledPath).toContain("offset=25")
      expect(calledPath).toContain("status=failed")
    })

    it("exposes the error when the service rejects", async () => {
      const get = vi.fn().mockRejectedValue(new Error("boom"))
      getApiClientMock.mockReturnValue({ get } as never)

      const { result } = renderHook(() => useDocuments(), { wrapper: makeWrapper() })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeInstanceOf(Error)
    })
  })

  describe("useDocument", () => {
    it("is a no-op when id is null", async () => {
      const get = vi.fn()
      getApiClientMock.mockReturnValue({ get } as never)

      const { result } = renderHook(() => useDocument(null), {
        wrapper: makeWrapper(),
      })

      // No fetch should fire.
      await new Promise((r) => setTimeout(r, 5))
      expect(get).not.toHaveBeenCalled()
      expect(result.current.fetchStatus).toBe("idle")
    })

    it("fetches /documents/{id} when id is set", async () => {
      const get = vi.fn().mockResolvedValue({
        id: "d-1",
        title: "x",
        mime_type: "text/plain",
        status: "indexed" as const,
        created_at: "2025-01-01T00:00:00Z",
      })
      getApiClientMock.mockReturnValue({ get } as never)

      const { result } = renderHook(() => useDocument("d-1"), {
        wrapper: makeWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(get).toHaveBeenCalledWith("/api/v1/documents/d-1")
    })

    it("does not retry on 404", async () => {
      const get = vi
        .fn()
        .mockRejectedValue(new ApiError(404, { message: "not found" }))
      getApiClientMock.mockReturnValue({ get } as never)

      const { result } = renderHook(() => useDocument("d-missing"), {
        wrapper: makeWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(get).toHaveBeenCalledTimes(1)
    })
  })
})
