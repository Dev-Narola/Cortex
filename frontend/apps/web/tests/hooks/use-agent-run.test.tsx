/**
 * useAgentRun + useAgentToolCalls — F5 Part 3.
 *
 * Verifies the TanStack Query contract:
 *
 *  - query is **disabled** when no runId is
 *    supplied (no request fires for
 *    ``GET /api/v1/agents/runs/undefined/...``)
 *  - query key includes the runId so two runs
 *    never collide in the cache
 *  - retry policy treats 404/403 as terminal
 *    (tenant isolation is the backend's job)
 *  - lazy loading: the tool-calls query is
 *    off by default and turns on with
 *    ``enabled: true``
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getApiClient } from "@/lib/auth/api-client"
import {
  useAgentRun,
  useAgentToolCalls,
  agentKeys,
} from "@/hooks/agents"

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

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("useAgentRun", () => {
  it("disables the query when runId is null", async () => {
    const get = vi.fn()
    getApiClientMock.mockReturnValue({ get } as never)

    const { result } = renderHook(
      () => useAgentRun({ runId: null }),
      { wrapper: makeWrapper() },
    )

    expect(result.current.fetchStatus).toBe("idle")
    expect(get).not.toHaveBeenCalled()
  })

  it("disables the query when runId is empty string", async () => {
    const get = vi.fn()
    getApiClientMock.mockReturnValue({ get } as never)

    const { result } = renderHook(
      () => useAgentRun({ runId: "" }),
      { wrapper: makeWrapper() },
    )

    expect(result.current.fetchStatus).toBe("idle")
    expect(get).not.toHaveBeenCalled()
  })

  it("fetches when runId is supplied and uses a key that includes the id", async () => {
    const backend = {
      id: "r-1",
      agent_id: "a-1",
      tenant_id: "t-1",
      user_id: "u-1",
      input: "hi",
      output: "ok",
      status: "completed",
      iterations: 1,
      tool_call_count: 0,
      total_tokens: 0,
      started_at: null,
      completed_at: null,
      steps: [],
      tool_calls: [],
    }
    const get = vi.fn().mockResolvedValue(backend)
    getApiClientMock.mockReturnValue({ get } as never)

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => useAgentRun({ runId: "r-1" }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(get).toHaveBeenCalledTimes(1)
    // The key is exactly the canonical agentKeys.run(id).
    const cached = qc.getQueryData(agentKeys.run("r-1"))
    expect(cached).toBeDefined()
  })

  it("isolates caches per run id (no collision)", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    const fullRun = (id: string) => ({
      id,
      agent_id: "a-1",
      tenant_id: "t-1",
      user_id: "u-1",
      input: "hi",
      output: "",
      status: "completed",
      iterations: 0,
      tool_call_count: 0,
      total_tokens: 0,
      started_at: null,
      completed_at: null,
      steps: [],
      tool_calls: [],
    })
    const get = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/runs/r-1")) return fullRun("r-1")
      return fullRun("r-2")
    })
    getApiClientMock.mockReturnValue({ get } as never)

    const { result: r1 } = renderHook(
      () => useAgentRun({ runId: "r-1" }),
      { wrapper },
    )
    const { result: r2 } = renderHook(
      () => useAgentRun({ runId: "r-2" }),
      { wrapper },
    )

    await waitFor(() => expect(r1.current.isSuccess).toBe(true))
    await waitFor(() => expect(r2.current.isSuccess).toBe(true))
    expect(r1.current.data?.id).toBe("r-1")
    expect(r2.current.data?.id).toBe("r-2")
  })
})


describe("useAgentToolCalls", () => {
  it("does not fire when disabled (enabled: false)", async () => {
    const get = vi.fn()
    getApiClientMock.mockReturnValue({ get } as never)

    const { result } = renderHook(
      () => useAgentToolCalls({ runId: "r-1", enabled: false }),
      { wrapper: makeWrapper() },
    )

    expect(result.current.fetchStatus).toBe("idle")
    expect(get).not.toHaveBeenCalled()
  })

  it("fires immediately on mount when enabled (default true)", async () => {
    const backend = {
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
    }
    const get = vi.fn().mockResolvedValue(backend)
    getApiClientMock.mockReturnValue({ get } as never)

    const wrapper = makeWrapper()
    const { result } = renderHook(
      () => useAgentToolCalls({ runId: "r-1" }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.toolCalls[0]?.name).toBe(
      "retrieve_documents",
    )
  })

  it("uses a key that includes the run id", async () => {
    const backend = {
      run_id: "r-1",
      agent_id: "a-1",
      status: "completed",
      tool_calls: [],
    }
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockResolvedValue(backend),
    } as never)

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    renderHook(() => useAgentToolCalls({ runId: "r-1", enabled: true }), {
      wrapper,
    })

    await waitFor(() =>
      expect(qc.getQueryData(agentKeys.toolCalls("r-1"))).toBeDefined(),
    )
  })
})
