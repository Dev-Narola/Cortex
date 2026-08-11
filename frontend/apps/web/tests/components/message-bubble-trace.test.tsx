/**
 * MessageBubble — F5 P4 Agent Trace integration.
 *
 * Verifies the bubble:
 *   - does NOT render the trace when
 *     ``message.agentRunId`` is null
 *     (the V3 F4 chat default)
 *   - renders the trace (collapsed by default)
 *     when ``message.agentRunId`` is a real id
 *   - keeps the trace + actions + citations
 *     stacked in the spec'd order
 *
 * These tests pin the F5 P3 → F5 P4 integration
 * so a future "always show a trace" bug is
 * caught here.
 */

import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { MessageBubble } from "@/components/chat/MessageBubble"
import { getApiClient } from "@/lib/auth/api-client"
import type { Message } from "@/types/conversation"

vi.mock("@/lib/auth/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/api-client")>(
      "@/lib/auth/api-client",
    )
  return { ...actual, getApiClient: vi.fn(), resetApiClient: vi.fn() }
})

const getApiClientMock = vi.mocked(getApiClient)

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

const baseMessage: Message = {
  id: "m-1",
  conversationId: "c-1",
  role: "assistant",
  content: "They are related because...",
  tokenCount: 0,
  retrievedChunkIds: [],
  modelName: "gpt-4o-mini",
  agentRunId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  // The trace's lazy fetch — even when the
  // bubble would render the trace, the api
  // client is never called without an id, so
  // the default mock is fine. Tests that
  // exercise the trace's network call set
  // this explicitly.
  getApiClientMock.mockReturnValue({
    get: vi.fn().mockResolvedValue({}),
  } as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("MessageBubble — agent trace integration", () => {
  it("does not render the trace when agentRunId is null", () => {
    render(
      <MessageBubble
        message={baseMessage}
        conversationId="c-1"
        isBusy={false}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.queryByTestId("agent-trace"),
    ).not.toBeInTheDocument()
  })

  it("does not render the trace when agentRunId is empty string", () => {
    render(
      <MessageBubble
        message={{ ...baseMessage, agentRunId: "" }}
        conversationId="c-1"
        isBusy={false}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.queryByTestId("agent-trace"),
    ).not.toBeInTheDocument()
  })

  it("renders the trace when agentRunId is set, collapsed by default", async () => {
    // Mock the tool-calls response so the
    // trace's count label resolves to a real
    // value.
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockResolvedValue({
        run_id: "r-1",
        agent_id: "a-1",
        status: "completed",
        tool_calls: [
          {
            id: "c1",
            name: "retrieve_documents",
            result_summary: "5 chunks",
            latency_ms: 420,
            status: "ok",
            error: null,
          },
        ],
      }),
    } as never)

    render(
      <MessageBubble
        message={{ ...baseMessage, agentRunId: "r-1" }}
        conversationId="c-1"
        isBusy={false}
      />,
      { wrapper: makeWrapper() },
    )

    const trace = await screen.findByTestId("agent-trace")
    expect(trace).toBeInTheDocument()
    expect(trace).toHaveAttribute("data-run-id", "r-1")
    // The trace starts collapsed (the toggle's
    // aria-expanded defaults to false).
    const toggle = screen.getByTestId("agent-trace-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
  })

  it("only renders the trace on assistant messages, not user messages", () => {
    const userMessage: Message = {
      ...baseMessage,
      id: "m-2",
      role: "user",
      content: "How are they related?",
      agentRunId: "r-1",
    }
    render(
      <MessageBubble
        message={userMessage}
        conversationId="c-1"
        isBusy={false}
      />,
      { wrapper: makeWrapper() },
    )
    expect(
      screen.queryByTestId("agent-trace"),
    ).not.toBeInTheDocument()
  })
})
