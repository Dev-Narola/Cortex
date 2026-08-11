/**
 * Agent types — the canonical frontend shape of an
 * :class:`AgentRun` and its tool calls.
 *
 * **F5 Part 3 (Task 5).** Mirrors the V3 backend's
 * `GET /api/v1/agents/runs/{run_id}/tool-calls` response
 * (and the `GET /api/v1/agents/runs/{run_id}` envelope
 * for the full run). The backend is the single source
 * of truth for the wire shape; this file is the
 * frontend's camelCase projection of that contract.
 *
 * **Why an adapter layer.** The backend serialises as
 * snake_case (`latency_ms`, `result_summary`, ...); the
 * frontend's convention is camelCase. The mapping is
 * done in the service (`getAgentRun` / `getAgentToolCalls`)
 * so components never deal with the backend's casing
 * directly. This is the project's standard API-DTO
 * pattern.
 *
 * **No fake data.** Every field is what the backend
 * actually returns. The trace UI must show real
 * latencies, real tool names, and real result
 * summaries — never placeholders.
 *
 * **Empty state.** The backend can legitimately return
 * an empty `tool_calls` list (an agent run that did not
 * call any tool). The frontend treats this as
 * "the run had no trace" rather than "the trace
 * failed to load" — the agent ran, the tool-calls
 * list is just empty.
 */

export type AgentRunStatus =
  | "started"
  | "running"
  | "completed"
  | "failed"
  | "stopped"

export type AgentToolCallStatus = "ok" | "error" | "unknown"

/**
 * A single tool call in an agent run.
 *
 * The backend flattens the in-memory
 * :class:`~src.execution.domain.entities.AgentStep`
 * structure into a single ordered list of tool calls,
 * appending a synthetic ``generate_answer`` record when
 * the run terminated with a non-tool final step. The
 * trace UI renders one :class:`AgentTraceStep` per record.
 */
export interface AgentToolCall {
  /**
   * Stable identifier. The backend uses the
   * LLM-provider tool call id when available
   * (``call_xxx`` for OpenAI); for the synthetic
   * ``generate_answer`` record it is
   * ``final-<iteration>``. Used as a React key.
   */
  id: string
  /** Tool name. Examples: ``retrieve_documents``,
   *  ``search_knowledge_graph``, ``generate_answer``,
   *  ``get_document``. The trace UI renders this in
   *  Mono. */
  name: string
  /**
   * One-line summary of the tool's result. The
   * backend derives this from the recorded
   * ``result`` payload (e.g. ``"5 chunks"``,
   * ``"3 entities"``, ``"Found 5 relevant chunks"``,
   * or ``"Tool failed"`` for a failed call). The
   * trace UI displays this verbatim.
   */
  resultSummary: string
  /**
   * Wall-clock duration of the parent step in
   * milliseconds. The agent loop records per-step
   * ``started_at`` / ``completed_at``; the backend
   * computes the diff. ``null`` when the step did
   * not finish cleanly (e.g. the guard tripped).
   */
  latencyMs: number | null
  /** Outcome of the call. The trace UI swaps the
   *  row's visual treatment for ``"error"``. */
  status: AgentToolCallStatus
  /** Short error string when ``status === "error"``. */
  error: string | null
}

/**
 * A raw ``AgentStep`` from the backend.
 *
 * Returned by ``GET /api/v1/agents/runs/{run_id}`` (the
 * full-run endpoint). The trace UI usually works with
 * :class:`AgentToolCall` instead; this shape is for the
 * operator view that wants the per-iteration LLM
 * exchange.
 */
export interface AgentStep {
  iteration: number
  output: string
  /** Tool calls the LLM asked for *within* this
   *  iteration. Empty for the final-answer iteration. */
  toolCalls: Array<Record<string, unknown>>
  error: string | null
  startedAt: string | null
  completedAt: string | null
  /** Pre-computed millisecond duration. */
  latencyMs: number | null
}

/**
 * A full :class:`AgentRun`.
 *
 * Returned by ``GET /api/v1/agents/runs/{run_id}``.
 * The ``toolCalls`` field is a convenience that
 * flattens ``steps`` into a single ordered list.
 */
export interface AgentRun {
  id: string
  agentId: string
  tenantId: string
  userId: string
  input: string
  output: string
  status: AgentRunStatus
  iterations: number
  toolCallCount: number
  totalTokens: number
  startedAt: string | null
  completedAt: string | null
  steps: AgentStep[]
  toolCalls: AgentToolCall[]
}

/**
 * The tool-calls envelope returned by
 * ``GET /api/v1/agents/runs/{run_id}/tool-calls``.
 *
 * Wraps the list in a top-level object so the
 * endpoint can grow (pagination, summary metadata,
 * ...) without breaking existing clients.
 */
export interface AgentToolCallsResponse {
  runId: string
  agentId: string
  status: AgentRunStatus
  toolCalls: AgentToolCall[]
}
