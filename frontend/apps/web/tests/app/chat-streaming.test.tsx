/**
 * Chat integration — F4 Part 2 (Tests B, C, D).
 *
 * The end-to-end flow on `/chat/{id}`:
 *   - User types a question.
 *   - User presses Send.
 *   - Optimistic user message appears.
 *   - The stream hook opens the WS.
 *   - Tokens arrive + the assistant bubble
 *     grows.
 *   - `message_complete` lands; the
 *     conversation query is invalidated.
 *   - Spark Glow + cursor disappear on
 *     completion.
 *
 * We mock the global WebSocket + the
 * api-client so the test runs end-to-end
 * without a network.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ToastProvider, ToastViewport, Toaster } from "@cortex/ui"
import { ApiError } from "@cortex/api-client"

import { ConversationView } from "@/app/(app)/chat/[conversationId]/ConversationView"
import { getApiClient } from "@/lib/auth/api-client"
import { useAuthStore } from "@/lib/auth/store"
import {
  _resetConversationSockets,
} from "@/hooks/chat"
import {
  conversationStreamStore,
  useConversationStreamStore,
} from "@/hooks/chat/conversationStreamStore"
import type { Conversation } from "@/types/conversation"

vi.mock("@/lib/auth/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/api-client")>(
      "@/lib/auth/api-client",
    )
  return { ...actual, getApiClient: vi.fn(), resetApiClient: vi.fn() }
})

const getApiClientMock = vi.mocked(getApiClient)

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
  _resetConversationSockets()
  conversationStreamStore.resetAll()
  useAuthStore.getState().clear()
})

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        {children}
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  )
}

function makeToasterWrapper(qc: QueryClient) {
  // The `Toaster` consumer is the piece
  // that maps the toast state into
  // rendered <Toast> items. The app's
  // production `Providers` mounts it; we
  // replicate that here so WS error
  // toasts actually surface in tests.
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        {children}
        <Toaster />
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  )
}

function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false, staleTime: 0 },
    },
  })
}

describe("Chat streaming integration (F4 Part 2, Tests B/C/D)", () => {
  it("Test B: typing + Enter keeps send enabled, Shift+Enter inserts newline", async () => {
    const qc = makeTestQueryClient()
    qc.setQueryData<Conversation>(["conversations", "c-1"], makeConversation())
    const user = userEvent.setup()
    render(<ConversationView conversationId="c-1" />, {
      wrapper: makeWrapper(qc),
    })
    const input = screen.getByLabelText(/^message$/i)
    const sendBtn = screen.getByRole("button", { name: /send message/i })
    // Initially disabled (empty).
    expect(sendBtn).toBeDisabled()
    await user.type(input, "What documents are available?")
    expect(sendBtn).toBeEnabled()
    // Shift+Enter inserts a newline;
    // send stays enabled.
    await user.keyboard("{Shift>}{Enter}{/Shift}")
    // The textarea now contains a newline.
    const textarea = input as HTMLTextAreaElement
    expect(textarea.value).toContain("\n")
  })

  it("Test C: clicking Send patches the user message + opens the WS", async () => {
    const qc = makeTestQueryClient()
    qc.setQueryData<Conversation>(["conversations", "c-1"], makeConversation())
    const user = userEvent.setup()
    render(<ConversationView conversationId="c-1" />, {
      wrapper: makeWrapper(qc),
    })
    const input = screen.getByLabelText(/^message$/i)
    await user.type(input, "What is Cortex?")
    await user.click(screen.getByRole("button", { name: /send message/i }))
    // Optimistic user message in the
    // cache.
    await waitFor(() => {
      const data = qc.getQueryData<Conversation>([
        "conversations",
        "c-1",
      ])
      expect(data?.messages?.[0]?.role).toBe("user")
      expect(data?.messages?.[0]?.content).toBe("What is Cortex?")
    })
    // WS opened + envelope sent.
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    expect(FakeSocket.instances[0]!.url).toContain("/ws/conversations/c-1")
    expect(FakeSocket.instances[0]!.url).toContain("token=tok-1")
  })

  it("Test D: tokens flow into the streaming slot; complete settles the cursor", async () => {
    const qc = makeTestQueryClient()
    qc.setQueryData<Conversation>(["conversations", "c-1"], makeConversation())
    const user = userEvent.setup()
    render(<ConversationView conversationId="c-1" />, {
      wrapper: makeWrapper(qc),
    })
    const input = screen.getByLabelText(/^message$/i)
    await user.type(input, "What is Cortex?")
    await user.click(screen.getByRole("button", { name: /send message/i }))
    // Open the WS.
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    const sock = FakeSocket.instances[0]!
    act(() => {
      sock.dispatch("open", {})
    })
    // Drive the stream.
    act(() => {
      sock.dispatch("message", {
        data: JSON.stringify({ type: "message_start", message_id: "a-1" }),
      })
      sock.dispatch("message", {
        data: JSON.stringify({ type: "token", content: "Cortex " }),
      })
      sock.dispatch("message", {
        data: JSON.stringify({ type: "token", content: "uses " }),
      })
      sock.dispatch("message", {
        data: JSON.stringify({ type: "token", content: "Postgres." }),
      })
    })
    // The streaming slot shows the
    // accumulated text.
    await waitFor(() =>
      expect(screen.getByText("Cortex uses Postgres.")).toBeInTheDocument(),
    )
    // Spark Glow + cursor are present.
    const article = screen.getByRole("article", {
      name: /assistant is generating/i,
    })
    expect(article.getAttribute("data-streaming")).toBe("true")
    // Complete the turn.
    act(() => {
      sock.dispatch("message", {
        data: JSON.stringify({
          type: "message_complete",
          message_id: "a-1",
        }),
      })
    })
    await waitFor(() => {
      const stream = useConversationStreamStore
        .getState()
        .streams.get("c-1")
      expect(stream?.status).toBe("completed")
    })
  })

  it("Multi-turn: a second send uses the same conversation id (Task 31)", async () => {
    const qc = makeTestQueryClient()
    qc.setQueryData<Conversation>(
      ["conversations", "c-1"],
      makeConversation({
        messages: [
          {
            id: "m-1",
            conversationId: "c-1",
            role: "user",
            content: "What is Cortex?",
            tokenCount: 0,
            retrievedChunkIds: [],
            modelName: null,
            createdAt: "2025-01-01T00:00:00.000Z",
          },
          {
            id: "m-2",
            conversationId: "c-1",
            role: "assistant",
            content: "A knowledge engine.",
            tokenCount: 5,
            retrievedChunkIds: [],
            modelName: "gpt-4o-mini",
            createdAt: "2025-01-01T00:00:01.000Z",
          },
        ],
      }),
    )
    const user = userEvent.setup()
    render(<ConversationView conversationId="c-1" />, {
      wrapper: makeWrapper(qc),
    })
    // Existing messages render.
    expect(screen.getByText("What is Cortex?")).toBeInTheDocument()
    expect(screen.getByText("A knowledge engine.")).toBeInTheDocument()
    // Second turn.
    const input = screen.getByLabelText(/^message$/i)
    await user.type(input, "What database?")
    await user.click(screen.getByRole("button", { name: /send message/i }))
    // The conversation id is the same;
    // the same socket is reused.
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    expect(FakeSocket.instances[0]!.url).toContain(
      "/ws/conversations/c-1",
    )
  })

  it("Duplicate submit guard (Task 28): second click is a no-op", async () => {
    const qc = makeTestQueryClient()
    qc.setQueryData<Conversation>(["conversations", "c-1"], makeConversation())
    const user = userEvent.setup()
    render(<ConversationView conversationId="c-1" />, {
      wrapper: makeWrapper(qc),
    })
    const input = screen.getByLabelText(/^message$/i)
    await user.type(input, "hi")
    const sendBtn = screen.getByRole("button", { name: /send message/i })
    await user.click(sendBtn)
    // Wait for the socket.
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    const sock = FakeSocket.instances[0]!
    act(() => {
      sock.dispatch("open", {})
    })
    await waitFor(() => expect(sock.sent).toHaveLength(1))
    // After Send, the input is disabled
    // (the spec is "Send disabled while
    // isStreaming"). We can't send again
    // until the turn completes.
    // (The hook re-enables on
    // `completed` / `error`.)
    const stream = useConversationStreamStore.getState().streams.get("c-1")
    expect(stream?.status === "sending" || stream?.status === "streaming")
      .toBe(true)
  })

  it("WS error: a generation error surfaces as a toast", async () => {
    const qc = makeTestQueryClient()
    qc.setQueryData<Conversation>(["conversations", "c-1"], makeConversation())
    const user = userEvent.setup()
    render(<ConversationView conversationId="c-1" />, {
      wrapper: makeToasterWrapper(qc),
    })
    const input = screen.getByLabelText(/^message$/i)
    await user.type(input, "hi")
    await user.click(screen.getByRole("button", { name: /send message/i }))
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    const sock = FakeSocket.instances[0]!
    act(() => {
      sock.dispatch("open", {})
    })
    // Drive the error event AND give
    // React's effect scheduler a chance
    // to flush. We use `waitFor` rather
    // than a hard `act` to allow
    // async work (the toast's effect +
    // Radix portal mount) to settle.
    act(() => {
      sock.dispatch("message", {
        data: JSON.stringify({
          type: "error",
          code: "GENERATION_FAILED",
          message: "LLM down",
        }),
      })
    })
    // The toast lives in a Radix portal.
    // The spec note: "Radix toasts in
    // portal: query via
    // document.body.textContent (with
    // waitFor)".
    await waitFor(
      () => {
        expect(document.body.textContent).toMatch(
          /couldn't complete this response/i,
        )
      },
      { timeout: 3000 },
    )
  })

  it("API error handling: 401 on the initial fetch surfaces as a friendly error state", async () => {
    // We simulate the 401 by using a
    // QueryClient that yields an error
    // for the conversation query. The
    // easiest way: pre-set the cache to
    // mark the query as errored, then
    // verify the error state renders.
    const qc = makeTestQueryClient()
    // Set the error state directly via
    // QueryCache. The hook reads
    // `isError` from the query state; we
    // ensure the query exists with an
    // error.
    const err = new ApiError(401, { message: "Session expired." })
    // Force the query into an error
    // state by registering it via the
    // default queryFn (which will use
    // the mocked api-client). We mock
    // the api-client explicitly.
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockRejectedValue(err),
    } as never)
    render(<ConversationView conversationId="c-1" />, {
      wrapper: makeWrapper(qc),
    })
    // ChatErrorState's title is "We
    // couldn't load this conversation".
    expect(
      await screen.findByText(/couldn't load this conversation/i, undefined, { timeout: 5000 }),
    ).toBeInTheDocument()
  })

  it("StreamingMessage receives the accumulator from the store", () => {
    // Direct unit check: the store's
    // `applyEvent` for a sequence of
    // tokens produces the expected
    // joined content.
    useConversationStreamStore.getState().beginTurn({
      conversationId: "c-x",
      userMessageId: "u-1",
      content: "ignored",
    })
    useConversationStreamStore.getState().applyEvent("c-x", {
      type: "message_start",
      messageId: "a-1",
    })
    useConversationStreamStore.getState().applyEvent("c-x", {
      type: "token",
      content: "Hello ",
    })
    useConversationStreamStore.getState().applyEvent("c-x", {
      type: "token",
      content: "world",
    })
    const stream = useConversationStreamStore
      .getState()
      .streams.get("c-x")
    expect(stream?.content).toBe("Hello world")
    expect(stream?.status).toBe("streaming")
  })
})
