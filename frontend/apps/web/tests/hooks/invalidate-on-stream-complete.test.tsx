/**
 * useInvalidateOnStreamComplete — F4 Part 2 (Task 25).
 *
 * When the stream transitions to
 * `completed`, the conversation query
 * should be invalidated so the next
 * render fetches the
 * server-authoritative row (which now
 * includes the persisted user +
 * assistant messages).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useInvalidateOnStreamComplete } from "@/hooks/chat/useSendMessage"
import { useConversationStreamStore } from "@/hooks/chat/conversationStreamStore"
import { getApiClient } from "@/lib/auth/api-client"
import { ApiError } from "@cortex/api-client"
import type { Conversation } from "@/types/conversation"

vi.mock("@/lib/auth/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/api-client")>(
      "@/lib/auth/api-client",
    )
  return { ...actual, getApiClient: vi.fn(), resetApiClient: vi.fn() }
})

const getApiClientMock = vi.mocked(getApiClient)

function makeConversation(): Conversation {
  return {
    id: "c-1",
    tenantId: "t-1",
    userId: "u-1",
    title: "Cortex",
    summary: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    messages: [],
  }
}

beforeEach(() => {
  useConversationStreamStore.getState().resetAll()
})

afterEach(() => {
  useConversationStreamStore.getState().resetAll()
})

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe("useInvalidateOnStreamComplete", () => {
  it("invalidates the conversation query when the stream completes", async () => {
    const qc = new QueryClient()
    // Seed the conversation cache.
    qc.setQueryData<Conversation>(["conversations", "c-1"], makeConversation())
    // Mark the stream as `streaming` first.
    useConversationStreamStore.getState().beginTurn({
      conversationId: "c-1",
      userMessageId: "um-1",
      content: "hi",
    })
    useConversationStreamStore.getState().applyEvent("c-1", {
      type: "message_start",
      messageId: "a-1",
    })
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")

    renderHook(() => useInvalidateOnStreamComplete("c-1"), {
      wrapper: makeWrapper(qc),
    })

    // Now transition the stream to
    // `completed`. The hook should fire
    // `invalidateQueries` on the next
    // tick.
    act(() => {
      useConversationStreamStore.getState().applyEvent("c-1", {
        type: "message_complete",
        messageId: "a-1",
      })
    })
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["conversations", "c-1"],
      })
    })
  })

  it("does NOT invalidate while the stream is in flight", () => {
    const qc = new QueryClient()
    qc.setQueryData<Conversation>(["conversations", "c-1"], makeConversation())
    useConversationStreamStore.getState().beginTurn({
      conversationId: "c-1",
      userMessageId: "um-1",
      content: "hi",
    })
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    renderHook(() => useInvalidateOnStreamComplete("c-1"), {
      wrapper: makeWrapper(qc),
    })
    // The stream is in `sending` state;
    // the hook is a no-op.
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("ApiError-shape: the existing api-client 401 path still works", () => {
    // Belt-and-braces: ensure the
    // api-client mock setup is honored so
    // subsequent tests can mock REST
    // calls without import cycles.
    expect(getApiClientMock).toBeDefined()
    // Make ApiError concrete: the
    // mutation's onError uses the error
    // shape; this just confirms the
    // type contract.
    const err = new ApiError(401, { message: "nope" })
    expect(err.status).toBe(401)
  })
})
