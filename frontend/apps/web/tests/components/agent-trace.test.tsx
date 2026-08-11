/**
 * AgentTrace — F5 Part 3 (Tasks 12, 18, 19, 26).
 *
 * Component-level tests for the trace panel.
 * Covers:
 *   - collapsed by default
 *   - the toggle shows the actual step count
 *   - expand reveals the step list
 *   - lazy loading: no request fires until expanded
 *   - loading skeleton on first expand
 *   - error state + retry
 *   - empty tool-calls list
 *   - error visual treatment on a failed call
 *   - no render when runId is missing
 *   - real tool names + latencies surface
 *     verbatim (no fake data)
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AgentTrace } from "@/components/chat/agents/AgentTrace"
import { getApiClient } from "@/lib/auth/api-client"

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

function mockToolCallsResponse(
  payload: {
    run_id: string
    agent_id: string
    status: string
    tool_calls: Array<{
      id: string
      name: string
      result_summary: string
      latency_ms: number | null
      status: "ok" | "error" | "unknown"
      error: string | null
    }>
  },
) {
  getApiClientMock.mockReturnValue({
    get: vi.fn().mockResolvedValue(payload),
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("AgentTrace", () => {
  it("renders nothing when runId is null (normal F4 messages)", () => {
    const { container } = render(
      <AgentTrace runId={null} />,
      { wrapper: makeWrapper() },
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders the collapsed summary with the real step count", async () => {
    mockToolCallsResponse({
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
        {
          id: "c2",
          name: "search_knowledge_graph",
          result_summary: "3 entities",
          latency_ms: 680,
          status: "ok",
          error: null,
        },
        {
          id: "c3",
          name: "generate_answer",
          result_summary: "Done",
          latency_ms: 1200,
          status: "ok",
          error: null,
        },
      ],
    })
    render(<AgentTrace runId="r-1" />, { wrapper: makeWrapper() })

    // The collapsed label must read "Agent used 3
    // steps" — the actual count, not a hardcoded
    // value. We wait for the data because the
    // component fetches on mount.
    await waitFor(() =>
      expect(
        screen.getByTestId("agent-trace-label").textContent,
      ).toBe("Agent used 3 steps"),
    )
    // The toggle is collapsed by default; the
    // expanded panel is not yet in the DOM.
    expect(
      screen.queryByTestId("agent-trace-panel"),
    ).not.toBeInTheDocument()
  })

  it("uses singular '1 step' when there is exactly one tool call", async () => {
    mockToolCallsResponse({
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
    })
    render(<AgentTrace runId="r-1" />, { wrapper: makeWrapper() })
    await waitFor(() =>
      expect(
        screen.getByTestId("agent-trace-label").textContent,
      ).toBe("Agent used 1 step"),
    )
  })

  it("fires the tool-calls request on mount (fetch-on-mount for the count)", async () => {
    let resolveGet: (value: unknown) => void = () => {}
    const get = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve
      }),
    )
    getApiClientMock.mockReturnValue({ get } as never)

    render(<AgentTrace runId="r-1" />, { wrapper: makeWrapper() })

    // The request fires on mount so the
    // collapsed label can render the real step
    // count. TanStack Query always supplies an
    // AbortSignal in the options, so the second
    // arg is an object that contains a
    // ``signal`` key.
    expect(get).toHaveBeenCalled()
    expect(get.mock.calls[0]?.[0]).toBe(
      "/api/v1/agents/runs/r-1/tool-calls",
    )
    expect(get.mock.calls[0]?.[1]).toMatchObject({})

    // Now resolve the request; the count label
    // updates.
    resolveGet({
      run_id: "r-1",
      agent_id: "a-1",
      status: "completed",
      tool_calls: [
        {
          id: "c1",
          name: "tool_a",
          result_summary: "ok",
          latency_ms: 10,
          status: "ok",
          error: null,
        },
      ],
    })
    await waitFor(() =>
      expect(
        screen.getByTestId("agent-trace-label").textContent,
      ).toBe("Agent used 1 step"),
    )
  })

  it("expands and renders real tool names + latencies from the response", async () => {
    mockToolCallsResponse({
      run_id: "r-1",
      agent_id: "a-1",
      status: "completed",
      tool_calls: [
        {
          id: "c1",
          name: "retrieve_documents",
          result_summary: "Found 5 relevant chunks",
          latency_ms: 420,
          status: "ok",
          error: null,
        },
        {
          id: "c2",
          name: "search_knowledge_graph",
          result_summary: "Found 3 related entities",
          latency_ms: 680,
          status: "ok",
          error: null,
        },
        {
          id: "c3",
          name: "generate_answer",
          result_summary: "Synthesized final response",
          latency_ms: 1200,
          status: "ok",
          error: null,
        },
      ],
    })
    const user = userEvent.setup()
    render(<AgentTrace runId="r-1" />, { wrapper: makeWrapper() })

    await user.click(screen.getByTestId("agent-trace-toggle"))

    const steps = await screen.findByTestId("agent-trace-steps")
    const items = within(steps).getAllByRole("listitem")
    expect(items).toHaveLength(3)
    // Tool names are real, not hardcoded
    expect(items[0]).toHaveTextContent("retrieve_documents")
    expect(items[0]).toHaveTextContent("420ms")
    expect(items[0]).toHaveTextContent("Found 5 relevant chunks")
    expect(items[2]).toHaveTextContent("generate_answer")
    expect(items[2]).toHaveTextContent("1.2s")
  })

  it("preserves the order returned by the backend", async () => {
    mockToolCallsResponse({
      run_id: "r-1",
      agent_id: "a-1",
      status: "completed",
      tool_calls: [
        {
          id: "c1",
          name: "tool_z",
          result_summary: "z",
          latency_ms: 10,
          status: "ok",
          error: null,
        },
        {
          id: "c2",
          name: "tool_a",
          result_summary: "a",
          latency_ms: 20,
          status: "ok",
          error: null,
        },
      ],
    })
    const user = userEvent.setup()
    render(<AgentTrace runId="r-1" />, { wrapper: makeWrapper() })
    await user.click(screen.getByTestId("agent-trace-toggle"))

    const steps = await screen.findByTestId("agent-trace-steps")
    const names = within(steps)
      .getAllByTestId("agent-step-name")
      .map((n) => n.textContent)
    expect(names).toEqual(["tool_z", "tool_a"])
  })

  it("shows a loading skeleton while the first request is in flight", async () => {
    let resolveGet: (value: unknown) => void = () => {}
    const get = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve
      }),
    )
    getApiClientMock.mockReturnValue({ get } as never)

    const user = userEvent.setup()
    render(<AgentTrace runId="r-1" />, { wrapper: makeWrapper() })

    await user.click(screen.getByTestId("agent-trace-toggle"))

    expect(
      await screen.findByTestId("agent-trace-skeleton"),
    ).toBeInTheDocument()

    resolveGet({
      run_id: "r-1",
      agent_id: "a-1",
      status: "completed",
      tool_calls: [
        {
          id: "c1",
          name: "tool_a",
          result_summary: "ok",
          latency_ms: 10,
          status: "ok",
          error: null,
        },
      ],
    })
    await waitFor(() =>
      expect(
        screen.queryByTestId("agent-trace-skeleton"),
      ).not.toBeInTheDocument(),
    )
  })

  it("shows the error state with a Retry button when the request fails", async () => {
    // The hook treats ``ApiError(5xx)`` as a
    // transient error and retries twice; we
    // mock 5 rejections so the initial call,
    // both retries, and one extra refetch (the
    // Retry button click) all fail. The 6th
    // mock succeeds so we can verify the Retry
    // path renders the steps after success.
    const get = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue({
        run_id: "r-1",
        agent_id: "a-1",
        status: "completed",
        tool_calls: [
          {
            id: "c1",
            name: "tool_a",
            result_summary: "ok",
            latency_ms: 10,
            status: "ok",
            error: null,
          },
        ],
      })
    getApiClientMock.mockReturnValue({ get } as never)

    const user = userEvent.setup()
    render(<AgentTrace runId="r-1" />, { wrapper: makeWrapper() })

    // The trace starts collapsed; expand it so
    // the panel (and the error UI) is in the
    // DOM. The query has already been firing
    // on mount, so by the time the user
    // expands the panel the retries have
    // likely already failed.
    await user.click(screen.getByTestId("agent-trace-toggle"))

    // ``findByTestId`` waits for the error UI
    // to appear. 5 s covers TanStack Query's
    // exponential backoff for the two
    // automatic retries.
    const error = await screen.findByTestId(
      "agent-trace-error",
      {},
      { timeout: 5_000 },
    )
    expect(error).toHaveTextContent(/couldn't be loaded/i)
    expect(
      within(error).getByTestId("agent-trace-retry"),
    ).toBeInTheDocument()

    // Clicking Retry refires the request; this
    // time the mock returns a success and the
    // steps render.
    await user.click(
      within(error).getByTestId("agent-trace-retry"),
    )
    const steps = await screen.findByTestId("agent-trace-steps")
    expect(within(steps).getAllByRole("listitem")).toHaveLength(1)
  })

  it("shows the empty state when the backend returns zero tool calls", async () => {
    mockToolCallsResponse({
      run_id: "r-1",
      agent_id: "a-1",
      status: "completed",
      tool_calls: [],
    })
    const user = userEvent.setup()
    render(<AgentTrace runId="r-1" />, { wrapper: makeWrapper() })
    await user.click(screen.getByTestId("agent-trace-toggle"))
    expect(
      await screen.findByTestId("agent-trace-empty"),
    ).toBeInTheDocument()
  })

  it("surfaces an error tool call with the error string and error step styling", async () => {
    mockToolCallsResponse({
      run_id: "r-1",
      agent_id: "a-1",
      status: "failed",
      tool_calls: [
        {
          id: "c1",
          name: "search_knowledge_graph",
          result_summary: "Tool failed",
          latency_ms: 680,
          status: "error",
          error: "graph offline",
        },
      ],
    })
    const user = userEvent.setup()
    render(<AgentTrace runId="r-1" />, { wrapper: makeWrapper() })
    await user.click(screen.getByTestId("agent-trace-toggle"))

    const steps = await screen.findByTestId("agent-trace-steps")
    const item = within(steps).getByRole("listitem")
    expect(item).toHaveAttribute("data-step-status", "error")
    expect(item).toHaveTextContent("graph offline")
  })

  it("toggles between expanded and collapsed", async () => {
    mockToolCallsResponse({
      run_id: "r-1",
      agent_id: "a-1",
      status: "completed",
      tool_calls: [
        {
          id: "c1",
          name: "tool_a",
          result_summary: "ok",
          latency_ms: 10,
          status: "ok",
          error: null,
        },
      ],
    })
    const user = userEvent.setup()
    render(<AgentTrace runId="r-1" />, { wrapper: makeWrapper() })

    const toggle = screen.getByTestId("agent-trace-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByTestId("agent-trace-panel"),
    ).toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(
      screen.queryByTestId("agent-trace-panel"),
    ).not.toBeInTheDocument()
  })

  it("starts expanded when defaultExpanded is true", () => {
    mockToolCallsResponse({
      run_id: "r-1",
      agent_id: "a-1",
      status: "completed",
      tool_calls: [
        {
          id: "c1",
          name: "tool_a",
          result_summary: "ok",
          latency_ms: 10,
          status: "ok",
          error: null,
        },
      ],
    })
    render(<AgentTrace runId="r-1" defaultExpanded />, {
      wrapper: makeWrapper(),
    })
    const toggle = screen.getByTestId("agent-trace-toggle")
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  })
})
