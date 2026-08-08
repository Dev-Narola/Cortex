/**
 * useConversationStream — F4 Part 2 (Task 19).
 *
 * Mirrors the F3 Part 4 `useIngestionStatus`
 * test. The hook is the lifecycle owner of
 * the per-conversation WebSocket; the tests
 * exercise the refcount + the
 * store-driving effect.
 *
 * **Coverage.**
 *   - First mount opens one socket.
 *   - The URL is `{NEXT_PUBLIC_WS_URL}/ws/conversations/{id}?token=…`.
 *   - The store's `connectionState` mirrors
 *     the socket's state.
 *   - A second mount on the SAME id
 *     refcounts (no second socket).
 *   - The last unmount disconnects.
 *   - When the store flips to `sending`,
 *     the hook opens the socket + sends
 *     the queued `pendingContent`.
 *   - WS events flow into the store
 *     (token → `content` accumulator,
 *     message_complete → `completed`).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/lib/auth/store"
import {
  useConversationStream,
  _resetConversationSockets,
} from "@/hooks/chat/useConversationStream"
import {
  conversationStreamStore,
  useConversationStreamStore,
} from "@/hooks/chat/conversationStreamStore"

class FakeSocket {
  static instances: FakeSocket[] = []
  static reset() {
    FakeSocket.instances = []
  }
  url: string
  closed = false
  sent: string[] = []
  private listeners = new Map<string, Array<(e: unknown) => void>>()
  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }
  addEventListener(name: string, cb: (e: unknown) => void): void {
    if (!this.listeners.has(name)) this.listeners.set(name, [])
    this.listeners.get(name)!.push(cb)
  }
  removeEventListener(): void {}
  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {
    this.closed = true
    this.dispatch("close", { code: 1000 })
  }
  dispatch(name: string, payload: unknown): void {
    for (const cb of this.listeners.get(name) ?? []) cb(payload)
  }
}

beforeEach(() => {
  FakeSocket.reset()
  _resetConversationSockets()
  conversationStreamStore.resetAll()
  vi.stubGlobal(
    "WebSocket",
    vi.fn((url: string) => new FakeSocket(url)) as unknown as typeof WebSocket,
  )
  useAuthStore.setState({
    accessToken: "tok-1",
    hydrated: true,
    restored: true,
    isRestoring: false,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  _resetConversationSockets()
  conversationStreamStore.resetAll()
  useAuthStore.getState().clear()
})

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe("useConversationStream (Task 19)", () => {
  it("opens one socket with the correct URL when a turn starts", async () => {
    const qc = new QueryClient()
    const { result, unmount } = renderHook(
      () => useConversationStream("c-1"),
      { wrapper: makeWrapper(qc) },
    )
    // The socket is opened lazily — only
    // when a turn starts. Verify the
    // pre-flight state, then begin a turn
    // and check the URL.
    expect(result.current.stream.status).toBe("idle")
    act(() => {
      conversationStreamStore.beginTurn({
        conversationId: "c-1",
        userMessageId: "um-1",
        content: "What is Cortex?",
      })
    })
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    const url = FakeSocket.instances[0]!.url
    expect(url).toContain("/ws/conversations/c-1")
    expect(url).toContain("token=tok-1")
    unmount()
  })

  it("refcounts: two mounts share one socket", async () => {
    const qc = new QueryClient()
    const a = renderHook(() => useConversationStream("c-1"), {
      wrapper: makeWrapper(qc),
    })
    const b = renderHook(() => useConversationStream("c-1"), {
      wrapper: makeWrapper(qc),
    })
    act(() => {
      conversationStreamStore.beginTurn({
        conversationId: "c-1",
        userMessageId: "um-1",
        content: "hi",
      })
    })
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    // No second socket.
    expect(FakeSocket.instances).toHaveLength(1)
    a.unmount()
    b.unmount()
  })

  it("disconnects on the last unmount", async () => {
    const qc = new QueryClient()
    const a = renderHook(() => useConversationStream("c-1"), {
      wrapper: makeWrapper(qc),
    })
    const b = renderHook(() => useConversationStream("c-1"), {
      wrapper: makeWrapper(qc),
    })
    act(() => {
      conversationStreamStore.beginTurn({
        conversationId: "c-1",
        userMessageId: "um-1",
        content: "hi",
      })
    })
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    a.unmount()
    expect(FakeSocket.instances[0]!.closed).toBe(false)
    b.unmount()
    expect(FakeSocket.instances[0]!.closed).toBe(true)
  })

  it("drives the socket when the store flips to sending", async () => {
    const qc = new QueryClient()
    const { unmount } = renderHook(() => useConversationStream("c-1"), {
      wrapper: makeWrapper(qc),
    })
    act(() => {
      conversationStreamStore.beginTurn({
        conversationId: "c-1",
        userMessageId: "um-1",
        content: "What is Cortex?",
      })
    })
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    // Open the socket.
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    await waitFor(() => {
      const sent = FakeSocket.instances[0]!.sent
      expect(sent).toHaveLength(1)
      expect(JSON.parse(sent[0]!)).toEqual({
        type: "message",
        content: "What is Cortex?",
      })
    })
    // And the connection state is now `open`.
    await waitFor(() => {
      const conn = useConversationStreamStore
        .getState()
        .connections.get("c-1")
      expect(conn).toBe("open")
    })
    unmount()
  })

  it("routes token events into the store accumulator", async () => {
    const qc = new QueryClient()
    const { unmount } = renderHook(() => useConversationStream("c-1"), {
      wrapper: makeWrapper(qc),
    })
    act(() => {
      conversationStreamStore.beginTurn({
        conversationId: "c-1",
        userMessageId: "um-1",
        content: "hi",
      })
    })
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    // Three tokens in order.
    act(() => {
      FakeSocket.instances[0]!.dispatch("message", {
        data: JSON.stringify({ type: "message_start", message_id: "a-1" }),
      })
      FakeSocket.instances[0]!.dispatch("message", {
        data: JSON.stringify({ type: "token", content: "Cortex" }),
      })
      FakeSocket.instances[0]!.dispatch("message", {
        data: JSON.stringify({ type: "token", content: " uses " }),
      })
      FakeSocket.instances[0]!.dispatch("message", {
        data: JSON.stringify({ type: "token", content: "Postgres" }),
      })
    })
    await waitFor(() => {
      const stream = useConversationStreamStore
        .getState()
        .streams.get("c-1")
      expect(stream?.content).toBe("Cortex uses Postgres")
      expect(stream?.assistantMessageId).toBe("a-1")
      expect(stream?.status).toBe("streaming")
    })
    act(() => {
      FakeSocket.instances[0]!.dispatch("message", {
        data: JSON.stringify({ type: "message_complete", message_id: "a-1" }),
      })
    })
    await waitFor(() => {
      const stream = useConversationStreamStore
        .getState()
        .streams.get("c-1")
      expect(stream?.status).toBe("completed")
    })
    unmount()
  })

  it("routes error events into the store", async () => {
    const qc = new QueryClient()
    const { unmount } = renderHook(() => useConversationStream("c-1"), {
      wrapper: makeWrapper(qc),
    })
    act(() => {
      conversationStreamStore.beginTurn({
        conversationId: "c-1",
        userMessageId: "um-1",
        content: "hi",
      })
    })
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    act(() => {
      FakeSocket.instances[0]!.dispatch("message", {
        data: JSON.stringify({
          type: "error",
          code: "GENERATION_FAILED",
          message: "LLM down",
        }),
      })
    })
    await waitFor(() => {
      const stream = useConversationStreamStore
        .getState()
        .streams.get("c-1")
      expect(stream?.status).toBe("error")
      expect(stream?.error?.code).toBe("GENERATION_FAILED")
    })
    unmount()
  })

  it("ignores a second beginTurn while a turn is in flight (Task 28)", async () => {
    const qc = new QueryClient()
    const { unmount } = renderHook(() => useConversationStream("c-1"), {
      wrapper: makeWrapper(qc),
    })
    act(() => {
      conversationStreamStore.beginTurn({
        conversationId: "c-1",
        userMessageId: "um-1",
        content: "first",
      })
    })
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    act(() => {
      FakeSocket.instances[0]!.dispatch("open", {})
    })
    await waitFor(() =>
      expect(FakeSocket.instances[0]!.sent).toHaveLength(1),
    )
    act(() => {
      conversationStreamStore.beginTurn({
        conversationId: "c-1",
        userMessageId: "um-2",
        content: "second (should be dropped)",
      })
    })
    // The second beginTurn is a no-op: the
    // store stays in `sending`, and the
    // socket did NOT receive a second
    // envelope.
    expect(FakeSocket.instances[0]!.sent).toHaveLength(1)
    unmount()
  })
})
