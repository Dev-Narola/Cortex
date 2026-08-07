/**
 * Document mutation hooks — F3 Part 3 (Tasks 25, 28, 29).
 *
 * Verifies that each hook wires the right service +
 * surfaces the right loading / error / success state.
 * We don't assert the onSuccess → invalidate
 * sequencing here (it's the modal's job, not the
 * hook's) — that's covered by the modal tests.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@cortex/api-client"

import {
  useDeleteDocument,
  useInvalidateDocuments,
  useReprocessDocument,
  useUploadDocument,
} from "@/hooks/documents"
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

describe("hooks/documents mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("useUploadDocument posts the file and returns the response", async () => {
    const post = vi.fn().mockResolvedValue({
      id: "new",
      status: "pending",
      message: "queued",
    })
    getApiClientMock.mockReturnValue({ post } as never)

    const { result } = renderHook(() => useUploadDocument(), {
      wrapper: makeWrapper(),
    })

    const file = new File(["x"], "x.txt", { type: "text/plain" })
    const response = await result.current.mutateAsync({ file })

    expect(response.id).toBe("new")
    expect(post).toHaveBeenCalledOnce()
  })

  it("useDeleteDocument calls the service and resolves on success", async () => {
    const del = vi.fn().mockResolvedValue(undefined)
    getApiClientMock.mockReturnValue({ delete: del } as never)

    const { result } = renderHook(() => useDeleteDocument(), {
      wrapper: makeWrapper(),
    })

    await result.current.mutateAsync({ id: "d-1" })
    expect(del).toHaveBeenCalledOnce()
  })

  it("useReprocessDocument posts to the reprocess endpoint", async () => {
    const post = vi.fn().mockResolvedValue({ message: "queued" })
    getApiClientMock.mockReturnValue({ post } as never)

    const { result } = renderHook(() => useReprocessDocument(), {
      wrapper: makeWrapper(),
    })

    const response = await result.current.mutateAsync({ id: "d-1" })
    expect(response.message).toBe("queued")
  })

  it("surfaces errors via the mutation error state", async () => {
    const post = vi
      .fn()
      .mockRejectedValue(new ApiError(500, { message: "boom" }))
    getApiClientMock.mockReturnValue({ post } as never)

    const { result } = renderHook(() => useUploadDocument(), {
      wrapper: makeWrapper(),
    })
    const file = new File(["x"], "x.txt", { type: "text/plain" })
    await expect(result.current.mutateAsync({ file })).rejects.toBeInstanceOf(
      ApiError,
    )
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it("useInvalidateDocuments invalidates the documents namespace", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
    vi.spyOn(client, "invalidateQueries").mockImplementation(invalidateQueries)

    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
    }

    const { result } = renderHook(() => useInvalidateDocuments(), {
      wrapper: Wrapper,
    })
    await result.current()
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["documents"],
    })
  })
})
