/**
 * useSendMessage — F4 Part 2 (Tasks 12, 14, 28).
 *
 * The mutation:
 *   1. Patches the optimistic user message
 *      into the conversation cache
 *      (Task 14: "user message appears
 *      immediately").
 *   2. Calls the `sendMessage` service,
 *      which flips the store to `sending`.
 *   3. Exposes the standard TanStack
 *      mutation API (`mutate`,
 *      `isPending`, `isError`, etc.).
 *
 * The test exercises the cache patch +
 * the store transition. The actual WS
 * lifecycle is the stream hook's
 * responsibility (covered in
 * `conversation-stream.test.tsx`).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSendMessage } from "@/hooks/chat/useSendMessage"
import {
  conversationStreamStore,
  useConversationStreamStore,
} from "@/hooks/chat/conversationStreamStore"
import { useAuthStore } from "@/lib/auth/store"
import type { Conversation } from "@/types/conversation"

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "c-1",
    tenantId: "t-1",
    userId: "u-1",
    title: "Cortex",
    summary: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    messages: [],
    ...overrides,
  }
}

beforeEach(() => {
  conversationStreamStore.resetAll()
  useAuthStore.setState({
    accessToken: "tok-1",
    hydrated: true,
    restored: true,
    isRestoring: false,
  })
})

afterEach(() => {
  conversationStreamStore.resetAll()
  useAuthStore.getState().clear()
  vi.restoreAllMocks()
})

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe("useSendMessage", () => {
  it("patches the user message into the conversation cache (Task 14)", async () => {
    const qc = new QueryClient()
    qc.setQueryData<Conversation>(["conversations", "c-1"], makeConversation())
    const { result } = renderHook(
      () => useSendMessage({ conversationId: "c-1" }),
      { wrapper: makeWrapper(qc) },
    )
    await act(async () => {
      await result.current.mutateAsync({ content: "What is Cortex?" })
    })
    const cacheData = qc.getQueryData<Conversation>([
      "conversations",
      "c-1",
    ])
    expect(cacheData?.messages).toHaveLength(1)
    expect(cacheData?.messages?.[0]?.role).toBe("user")
    expect(cacheData?.messages?.[0]?.content).toBe("What is Cortex?")
  })

  it("flips the stream store to `sending`", async () => {
    const qc = new QueryClient()
    qc.setQueryData<Conversation>(["conversations", "c-1"], makeConversation())
    const { result } = renderHook(
      () => useSendMessage({ conversationId: "c-1" }),
      { wrapper: makeWrapper(qc) },
    )
    await act(async () => {
      await result.current.mutateAsync({ content: "hi" })
    })
    const stream = useConversationStreamStore
      .getState()
      .streams.get("c-1")
    expect(stream?.status).toBe("sending")
    expect(stream?.pendingContent).toBe("hi")
  })

  it("rolls back the optimistic patch on error", async () => {
    const qc = new QueryClient()
    const original = makeConversation({
      messages: [
        {
          id: "m-0",
          conversationId: "c-1",
          role: "user",
          content: "previous",
          tokenCount: 0,
          retrievedChunkIds: [],
          modelName: null,
          agentRunId: null,
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
    })
    qc.setQueryData<Conversation>(["conversations", "c-1"], original)
    const { result } = renderHook(
      () => useSendMessage({ conversationId: "c-1" }),
      { wrapper: makeWrapper(qc) },
    )
    // Force the mutation to throw by
    // pre-setting an auth-lacking state
    // (the service throws on missing
    // token).
    const { useAuthStore } = await import("@/lib/auth/store")
    const prior = useAuthStore.getState().accessToken
    useAuthStore.setState({ accessToken: null })
    try {
      await act(async () => {
        await result.current
          .mutateAsync({ content: "new message" })
          .catch(() => {})
      })
      const after = qc.getQueryData<Conversation>([
        "conversations",
        "c-1",
      ])
      // The optimistic patch was rolled
      // back, so the messages list is back
      // to the prior state.
      expect(after?.messages).toEqual(original.messages)
    } finally {
      useAuthStore.setState({ accessToken: prior })
    }
  })

  it("is idempotent while a turn is in flight (Task 28)", async () => {
    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
    qc.setQueryData<Conversation>(["conversations", "c-1"], makeConversation())
    const { result } = renderHook(
      () => useSendMessage({ conversationId: "c-1" }),
      { wrapper: makeWrapper(qc) },
    )
    await act(async () => {
      await result.current.mutateAsync({ content: "first" })
    })
    // Second submit. The store drops it
    // on the floor — the mutation throws,
    // the rollback restores the cache, the
    // user sees no double.
    await act(async () => {
      try {
        await result.current.mutateAsync({ content: "second (dropped)" })
      } catch {
        // expected: the guard throws
      }
    })
    const cacheData = qc.getQueryData<Conversation>([
      "conversations",
      "c-1",
    ])
    expect(cacheData?.messages).toHaveLength(1)
    expect(cacheData?.messages?.[0]?.content).toBe("first")
  })

  it("emits a mutation result with the user message id", async () => {
    const qc = new QueryClient()
    qc.setQueryData<Conversation>(["conversations", "c-1"], makeConversation())
    const { result } = renderHook(
      () => useSendMessage({ conversationId: "c-1" }),
      { wrapper: makeWrapper(qc) },
    )
    let mutationResult: { userMessageId: string; conversationId: string } | null =
      null
    await act(async () => {
      mutationResult = await result.current.mutateAsync({
        content: "hi",
      })
    })
    expect(mutationResult).not.toBeNull()
    expect(mutationResult!.conversationId).toBe("c-1")
    expect(mutationResult!.userMessageId).toMatch(/.+/)
  })
})
