/**
 * getAgentRun + getAgentToolCalls — F5 Part 3 (Task 7-9).
 *
 * Verifies the api-client wiring for the agent
 * trace endpoints. The backend serves:
 *
 *   GET /api/v1/agents/runs/{runId}
 *   GET /api/v1/agents/runs/{runId}/tool-calls
 *
 * The service is the only place that knows the
 * URLs + the response shape; tests pin the
 * contract so a future route change surfaces
 * immediately.
 *
 * **Casing adapter.** The service translates
 * the backend's snake_case
 * (``latency_ms`` / ``result_summary``) to the
 * frontend's camelCase (``latencyMs`` /
 * ``resultSummary``). The tests below cover
 * both directions so the adapter cannot
 * silently drop a field.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { getApiClient } from "@/lib/auth/api-client"
import {
  getAgentRun,
  getAgentToolCalls,
} from "@/services/agents"

vi.mock("@/lib/auth/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/api-client")>(
      "@/lib/auth/api-client",
    )
  return { ...actual, getApiClient: vi.fn(), resetApiClient: vi.fn() }
})

const getApiClientMock = vi.mocked(getApiClient)

describe("services/getAgentRun", () => {
  afterEach(() => vi.clearAllMocks())

  it("GETs /api/v1/agents/runs/{runId} and maps snake_case to camelCase", async () => {
    const backend = {
      id: "11111111-1111-1111-1111-111111111111",
      agent_id: "22222222-2222-2222-2222-222222222222",
      tenant_id: "33333333-3333-3333-3333-333333333333",
      user_id: "44444444-4444-4444-4444-444444444444",
      input: "How are these related?",
      output: "They share a database schema.",
      status: "completed",
      iterations: 3,
      tool_call_count: 2,
      total_tokens: 1500,
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-01T00:00:01.500Z",
      steps: [
        {
          iteration: 1,
          output: "",
          tool_calls: [],
          error: null,
          started_at: "2026-01-01T00:00:00.000Z",
          completed_at: "2026-01-01T00:00:00.420Z",
          latency_ms: 420,
        },
      ],
      tool_calls: [
        {
          id: "call_1",
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

    const result = await getAgentRun({ runId: backend.id })

    expect(get).toHaveBeenCalledWith(
      `/api/v1/agents/runs/${backend.id}`,
      {},
    )
    expect(result.id).toBe(backend.id)
    expect(result.agentId).toBe(backend.agent_id)
    expect(result.toolCallCount).toBe(2)
    expect(result.steps[0]?.latencyMs).toBe(420)
    expect(result.toolCalls[0]).toEqual({
      id: "call_1",
      name: "retrieve_documents",
      resultSummary: "5 chunks",
      latencyMs: 420,
      status: "ok",
      error: null,
    })
  })

  it("URL-encodes run ids with special characters", async () => {
    const fullRun = {
      id: "r-1",
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
    }
    const get = vi.fn().mockResolvedValue(fullRun)
    getApiClientMock.mockReturnValue({ get } as never)

    await getAgentRun({ runId: "a/b c" })

    expect(get).toHaveBeenCalledWith(
      "/api/v1/agents/runs/a%2Fb%20c",
      {},
    )
  })

  it("passes the abort signal through to the client", async () => {
    const fullRun = {
      id: "r-1",
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
    }
    const get = vi.fn().mockResolvedValue(fullRun)
    getApiClientMock.mockReturnValue({ get } as never)
    const ctrl = new AbortController()

    await getAgentRun({ runId: "r-1", signal: ctrl.signal })

    expect(get).toHaveBeenCalledWith("/api/v1/agents/runs/r-1", {
      signal: ctrl.signal,
    })
  })

  it("propagates backend errors", async () => {
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error("404 not found")),
    } as never)

    await expect(getAgentRun({ runId: "missing" })).rejects.toThrow(
      "404 not found",
    )
  })
})

describe("services/getAgentToolCalls", () => {
  afterEach(() => vi.clearAllMocks())

  it("GETs /api/v1/agents/runs/{runId}/tool-calls and maps to camelCase", async () => {
    const backend = {
      run_id: "r-1",
      agent_id: "a-1",
      status: "completed",
      tool_calls: [
        {
          id: "call_1",
          name: "retrieve_documents",
          result_summary: "5 chunks",
          latency_ms: 420,
          status: "ok",
          error: null,
        },
        {
          id: "final-3",
          name: "generate_answer",
          result_summary: "Done",
          latency_ms: 100,
          status: "ok",
          error: null,
        },
      ],
    }
    const get = vi.fn().mockResolvedValue(backend)
    getApiClientMock.mockReturnValue({ get } as never)

    const result = await getAgentToolCalls({ runId: "r-1" })

    expect(get).toHaveBeenCalledWith(
      "/api/v1/agents/runs/r-1/tool-calls",
      {},
    )
    expect(result.runId).toBe("r-1")
    expect(result.agentId).toBe("a-1")
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[0]).toEqual({
      id: "call_1",
      name: "retrieve_documents",
      resultSummary: "5 chunks",
      latencyMs: 420,
      status: "ok",
      error: null,
    })
  })

  it("maps an error tool call", async () => {
    const backend = {
      run_id: "r-1",
      agent_id: "a-1",
      status: "failed",
      tool_calls: [
        {
          id: "call_1",
          name: "search_graph",
          result_summary: "Tool failed",
          latency_ms: 200,
          status: "error",
          error: "graph offline",
        },
      ],
    }
    const get = vi.fn().mockResolvedValue(backend)
    getApiClientMock.mockReturnValue({ get } as never)

    const result = await getAgentToolCalls({ runId: "r-1" })

    expect(result.toolCalls[0]?.status).toBe("error")
    expect(result.toolCalls[0]?.error).toBe("graph offline")
  })

  it("preserves a null latency", async () => {
    const backend = {
      run_id: "r-1",
      agent_id: "a-1",
      status: "stopped",
      tool_calls: [
        {
          id: "call_1",
          name: "tool_a",
          result_summary: "(no output)",
          latency_ms: null,
          status: "unknown",
          error: null,
        },
      ],
    }
    const get = vi.fn().mockResolvedValue(backend)
    getApiClientMock.mockReturnValue({ get } as never)

    const result = await getAgentToolCalls({ runId: "r-1" })

    expect(result.toolCalls[0]?.latencyMs).toBeNull()
    expect(result.toolCalls[0]?.status).toBe("unknown")
  })

  it("propagates backend errors", async () => {
    getApiClientMock.mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error("network down")),
    } as never)

    await expect(
      getAgentToolCalls({ runId: "r-1" }),
    ).rejects.toThrow("network down")
  })
})
