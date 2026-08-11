/**
 * Get agent run — `GET /agents/runs/{run_id}` +
 * `GET /agents/runs/{run_id}/tool-calls`.
 *
 * **F5 Part 3 (Task 7).** The frontend's
 * ``AgentTrace`` reads from these two endpoints. The
 * route layer never calls the network directly —
 * the service is the single place that knows the
 * URL + the request shape + the response type.
 *
 * **Casing adapter.** The backend serialises in
 * snake_case (``latency_ms``); the frontend types
 * in :file:`types/agent.ts` are camelCase. The
 * service performs the mapping once so components
 * never see the backend's casing. Components that
 * receive the converted object can rely on the
 * camelCase field names.
 *
 * **Auth + tenant scope.** Same singleton
 * ``getApiClient()`` the other F5 services use
 * (auth, tenant scope, silent refresh, 401 retry,
 * 429 banner, ...). The backend's
 * ``get_current_user`` enforces tenant + user scope
 * at the SQL level; a 404 from these endpoints
 * means "not found OR not yours" — the frontend
 * never sees the difference.
 *
 * **Abort signal.** Both helpers accept an optional
 * ``signal`` so React effects can cancel an
 * in-flight request on unmount.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type {
  AgentRun,
  AgentStep,
  AgentToolCall,
  AgentToolCallStatus,
  AgentToolCallsResponse,
  AgentRunStatus,
} from "@/types/agent"

// ---------------------------------------------------------------------------
// Backend → frontend adapter
// ---------------------------------------------------------------------------

/**
 * The raw shape the backend returns for a single
 * tool call. Defined locally so the snake_case
 * contract is explicit at the adapter boundary.
 */
interface BackendToolCall {
  id: string
  name: string
  result_summary: string
  latency_ms: number | null
  status: AgentToolCallStatus
  error: string | null
}

/**
 * The raw shape the backend returns for a single
 * step. Used by the full-run endpoint.
 */
interface BackendStep {
  iteration: number
  output: string
  tool_calls: Array<Record<string, unknown>>
  error: string | null
  started_at: string | null
  completed_at: string | null
  latency_ms: number | null
}

/**
 * The raw shape the backend returns for a full
 * run.
 */
interface BackendRun {
  id: string
  agent_id: string
  tenant_id: string
  user_id: string
  input: string
  output: string
  status: AgentRunStatus
  iterations: number
  tool_call_count: number
  total_tokens: number
  started_at: string | null
  completed_at: string | null
  steps: BackendStep[]
  tool_calls: BackendToolCall[]
}

/**
 * The raw shape the tool-calls endpoint returns.
 */
interface BackendToolCallsResponse {
  run_id: string
  agent_id: string
  status: AgentRunStatus
  tool_calls: BackendToolCall[]
}

function toAgentToolCall(raw: BackendToolCall): AgentToolCall {
  return {
    id: raw.id,
    name: raw.name,
    resultSummary: raw.result_summary,
    latencyMs: raw.latency_ms,
    status: raw.status,
    error: raw.error,
  }
}

function toAgentStep(raw: BackendStep): AgentStep {
  return {
    iteration: raw.iteration,
    output: raw.output,
    toolCalls: raw.tool_calls,
    error: raw.error,
    startedAt: raw.started_at,
    completedAt: raw.completed_at,
    latencyMs: raw.latency_ms,
  }
}

function toAgentRun(raw: BackendRun): AgentRun {
  return {
    id: raw.id,
    agentId: raw.agent_id,
    tenantId: raw.tenant_id,
    userId: raw.user_id,
    input: raw.input,
    output: raw.output,
    status: raw.status,
    iterations: raw.iterations,
    toolCallCount: raw.tool_call_count,
    totalTokens: raw.total_tokens,
    startedAt: raw.started_at,
    completedAt: raw.completed_at,
    steps: raw.steps.map(toAgentStep),
    toolCalls: raw.tool_calls.map(toAgentToolCall),
  }
}

// ---------------------------------------------------------------------------
// getAgentRun
// ---------------------------------------------------------------------------

export interface GetAgentRunParams {
  runId: string
  signal?: AbortSignal
}

/**
 * Fetch a single :class:`AgentRun` for the
 * requesting tenant.
 *
 * Returns the full envelope (status, steps, flat
 * tool-calls). Most components only need the flat
 * tool-calls; the hook layer can call the cheaper
 * ``getAgentToolCalls`` instead.
 */
export async function getAgentRun(
  params: GetAgentRunParams,
): Promise<AgentRun> {
  const client = getApiClient()
  const raw = await client.get<BackendRun>(
    `/api/v1/agents/runs/${encodeURIComponent(params.runId)}`,
    params.signal ? { signal: params.signal } : {},
  )
  return toAgentRun(raw)
}

// ---------------------------------------------------------------------------
// getAgentToolCalls
// ---------------------------------------------------------------------------

export interface GetAgentToolCallsParams {
  runId: string
  signal?: AbortSignal
}

/**
 * Fetch the flattened tool-call list for an
 * :class:`AgentRun`.
 *
 * The trace UI uses this endpoint directly. The
 * payload is intentionally small (one record per
 * tool call + a synthetic ``generate_answer``
 * record for the final-answer step) so the wire
 * stays small even for long runs.
 */
export async function getAgentToolCalls(
  params: GetAgentToolCallsParams,
): Promise<AgentToolCallsResponse> {
  const client = getApiClient()
  const raw = await client.get<BackendToolCallsResponse>(
    `/api/v1/agents/runs/${encodeURIComponent(params.runId)}/tool-calls`,
    params.signal ? { signal: params.signal } : {},
  )
  return {
    runId: raw.run_id,
    agentId: raw.agent_id,
    status: raw.status,
    toolCalls: raw.tool_calls.map(toAgentToolCall),
  }
}
