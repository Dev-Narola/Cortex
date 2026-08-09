/**
 * useCitation — F4 Part 3 (Tasks 66, 67).
 *
 * The hook reads from the conversation
 * stream store. It returns a TanStack
 * Query-shaped object (`status`, `data`,
 * `isLoading`, `isError`, `refetch`) so
 * the panel can render every fetch state
 * consistently.
 *
 * **Cache key shape (Task 66).** Today's
 * hook is store-backed (the backend has
 * no chunk REST endpoint), so the cache
 * is the per-conversation stream store.
 * When F3 lands a chunk-detail endpoint
 * the hook's swap to TanStack Query is
 * mechanical: the same `status` /
 * `data` shape, a new query key
 * `["document-chunk", chunkId]`.
 *
 * **Status: "unavailable" (Task 58).**
 * Returned when the stream did not
 * include the citation metadata for a
 * chunk id that's on the message. The
 * panel renders a friendly "Source
 * unavailable" state — we never crash.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useCitation } from "@/hooks/chat/useCitation"
import { useConversationStreamStore } from "@/hooks/chat/conversationStreamStore"

function makeWrapper() {
  const qc = new QueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  useConversationStreamStore.getState().resetAll()
})

afterEach(() => {
  useConversationStreamStore.getState().resetAll()
})

describe("useCitation (Task 66)", () => {
  it("returns 'missing' status when no citation is selected", () => {
    const { result } = renderHook(
      () => useCitation({ conversationId: "c-1", citationId: null }),
      { wrapper: makeWrapper() },
    )
    expect(result.current.status).toBe("missing")
    expect(result.current.data).toBeNull()
  })

  it("returns 'ready' status + Citation when the stream has the chunk", () => {
    // Seed the stream store with one
    // citation.
    act(() => {
      useConversationStreamStore.getState().beginTurn({
        conversationId: "c-1",
        userMessageId: "u-1",
        content: "hi",
      })
      useConversationStreamStore.getState().applyEvent("c-1", {
        type: "message_start",
        messageId: "a-1",
      })
      useConversationStreamStore.getState().applyEvent("c-1", {
        type: "citation",
        citation: {
          documentId: "doc-1",
          chunkId: "chunk-1",
          documentTitle: "Doc 1",
          chunkIndex: 0,
          score: 0.91,
          excerpt: "Sample excerpt",
        },
      })
    })
    const { result } = renderHook(
      () =>
        useCitation({ conversationId: "c-1", citationId: "citation:chunk-1" }),
      { wrapper: makeWrapper() },
    )
    expect(result.current.status).toBe("ready")
    expect(result.current.data).toMatchObject({
      index: 1,
      chunkId: "chunk-1",
      documentTitle: "Doc 1",
      excerpt: "Sample excerpt",
    })
  })

  it("returns 'unavailable' when the stream did not include the chunk (Task 58)", () => {
    act(() => {
      useConversationStreamStore.getState().beginTurn({
        conversationId: "c-1",
        userMessageId: "u-1",
        content: "hi",
      })
    })
    const { result } = renderHook(
      () =>
        useCitation({ conversationId: "c-1", citationId: "citation:chunk-X" }),
      { wrapper: makeWrapper() },
    )
    expect(result.current.status).toBe("unavailable")
    expect(result.current.data).toBeNull()
  })
})
