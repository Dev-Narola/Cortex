/**
 * Chat hooks — F4 Part 1 (Tasks 5 + 7).
 *
 * Verifies the TanStack Query contracts for the
 * create + get hooks, including the no-404-retry
 * rule on `useConversation` and the list-cache
 * invalidation on `useCreateConversation`.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@cortex/api-client"

import {
  useConversation,
  useCreateConversation,
  useInvalidateConversations,
} from "@/hooks/chat"
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

describe("hooks/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("useCreateConversation", () => {
    it("POSTs and returns the conversation", async () => {
      const post = vi.fn().mockResolvedValue({
        id: "c-1",
        tenantId: "t-1",
        userId: "u-1",
        title: "New conversation",
        summary: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      })
      getApiClientMock.mockReturnValue({ post } as never)

      const { result } = renderHook(() => useCreateConversation(), {
        wrapper: makeWrapper(),
      })

      const conversation = await result.current.mutateAsync({
        title: "New conversation",
      })

      expect(conversation.id).toBe("c-1")
      expect(post).toHaveBeenCalledOnce()
    })

    it("invalidates the ['conversations'] namespace on success", async () => {
      const post = vi.fn().mockResolvedValue({
        id: "c-2",
        tenantId: "t-1",
        userId: "u-1",
        title: "x",
        summary: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      })
      getApiClientMock.mockReturnValue({ post } as never)
      const invalidateQueries = vi.fn().mockResolvedValue(undefined)
      const qc = new QueryClient({
        defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
      })
      vi.spyOn(qc, "invalidateQueries").mockImplementation(invalidateQueries)

      function Wrapper({ children }: { children: React.ReactNode }) {
        return (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        )
      }

      const { result } = renderHook(() => useCreateConversation(), {
        wrapper: Wrapper,
      })
      await result.current.mutateAsync({ title: "x" })
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["conversations", "list"],
      })
    })

    it("surfaces errors via the mutation error state", async () => {
      const post = vi.fn().mockRejectedValue(new ApiError(400, { message: "x" }))
      getApiClientMock.mockReturnValue({ post } as never)

      const { result } = renderHook(() => useCreateConversation(), {
        wrapper: makeWrapper(),
      })
      await expect(
        result.current.mutateAsync({ title: "x" }),
      ).rejects.toBeInstanceOf(ApiError)
    })
  })

  describe("useConversation", () => {
    it("is a no-op when id is null", async () => {
      const get = vi.fn()
      getApiClientMock.mockReturnValue({ get } as never)

      const { result } = renderHook(() => useConversation(null), {
        wrapper: makeWrapper(),
      })

      await new Promise((r) => setTimeout(r, 5))
      expect(get).not.toHaveBeenCalled()
      expect(result.current.fetchStatus).toBe("idle")
    })

    it("fetches /conversations/{id} when id is set", async () => {
      const get = vi.fn().mockResolvedValue({
        id: "c-1",
        tenantId: "t-1",
        userId: "u-1",
        title: "x",
        summary: null,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        messages: [],
      })
      getApiClientMock.mockReturnValue({ get } as never)

      const { result } = renderHook(() => useConversation("c-1"), {
        wrapper: makeWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(get).toHaveBeenCalledWith("/api/v1/conversations/c-1", {
        signal: undefined,
      })
      expect(result.current.data?.id).toBe("c-1")
    })

    it("does not retry on 404", async () => {
      const get = vi
        .fn()
        .mockRejectedValue(new ApiError(404, { message: "not found" }))
      getApiClientMock.mockReturnValue({ get } as never)

      const { result } = renderHook(() => useConversation("missing"), {
        wrapper: makeWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(get).toHaveBeenCalledTimes(1)
    })
  })

  describe("useInvalidateConversations", () => {
    it("invalidates the conversations namespace", async () => {
      const invalidateQueries = vi.fn().mockResolvedValue(undefined)
      const qc = new QueryClient({
        defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
      })
      vi.spyOn(qc, "invalidateQueries").mockImplementation(invalidateQueries)

      function Wrapper({ children }: { children: React.ReactNode }) {
        return (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        )
      }

      const { result } = renderHook(() => useInvalidateConversations(), {
        wrapper: Wrapper,
      })
      await result.current()
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["conversations", "list"],
      })
    })
  })
})
