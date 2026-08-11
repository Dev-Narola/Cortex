/**
 * useAgentRun + useAgentToolCalls — F5 Part 3.
 *
 * Thin TanStack Query wrappers around the
 * ``getAgentRun`` / ``getAgentToolCalls`` services.
 *
 * **Architecture.**
 *   Component (AgentTrace, AgentRunPage)
 *     ↓
 *   useAgentToolCalls(runId)
 *     ↓
 *   TanStack Query (key: ``agentKeys.toolCalls(runId)``)
 *     ↓
 *   getAgentToolCalls() — ``lib/api/agents.ts``
 *     ↓
 *   GET /api/v1/agents/runs/{runId}/tool-calls
 *
 * **Query disabled without a run id.** A normal
 * F4 question may not have an agent run; the trace
 * UI must not fire
 *   ``GET /api/v1/agents/runs/undefined/tool-calls``
 * when the run id is missing. ``enabled: Boolean(runId)``
 * guards the request. (Spec Task 12.)
 *
 * **Stale time.** Tool-call lists are immutable
 * once the run is terminal (``completed``,
 * ``failed``, ``stopped``). A run in flight can
 * still mutate, but the trace UI is only mounted
 * for terminal runs. 5 minutes is the right window
 * — long enough that opening + closing the trace
 * panel never refetches, short enough that a run
 * the user has open in two tabs stays consistent.
 *
 * **Retry.** Same 404/403 don't-retry rule the
 * other F5 hooks use. Tenant-isolation is the
 * backend's job; the frontend just respects the
 * answer.
 *
 * **No polling.** The agent system is
 * synchronous: ``POST /agents/{id}/execute`` returns
 * the final result. The trace UI is only ever
 * mounted against a terminal run. No need to
 * poll.
 */

"use client"

import {
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import {
  getAgentRun,
  getAgentToolCalls,
} from "@/services/agents"
import type {
  AgentRun,
  AgentToolCallsResponse,
} from "@/types/agent"

import { agentKeys } from "./agentKeys"

export interface UseAgentRunParams {
  runId: string | null | undefined
  /**
   * Disable the query entirely (e.g. when the
   * user is signed out). Defaults to ``true``
   * when ``runId`` is a non-empty string.
   */
  enabled?: boolean
}

export type UseAgentRunResult = UseQueryResult<AgentRun, Error>

export function useAgentRun(
  params: UseAgentRunParams,
): UseAgentRunResult {
  const { runId, enabled = true } = params
  const hasRunId = typeof runId === "string" && runId.length > 0
  return useQuery<AgentRun, Error>({
    queryKey: hasRunId ? agentKeys.run(runId) : agentKeys.runs(),
    queryFn: ({ signal }) =>
      getAgentRun({ runId: runId as string, signal }),
    enabled: enabled && hasRunId,
    staleTime: 5 * 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError) {
        if (error.status === 404 || error.status === 403) return false
      }
      return failureCount < 2
    },
  })
}

export interface UseAgentToolCallsParams {
  runId: string | null | undefined
  /**
   * Disable the query entirely. Defaults to
   * ``true`` when ``runId`` is a non-empty string.
   *
   * The trace UI uses this to implement lazy
   * loading: the panel starts collapsed + the
   * query is disabled; when the user expands the
   * panel the parent flips ``enabled`` to
   * ``true``. (Spec Tasks 26 + 27.)
   */
  enabled?: boolean
}

export type UseAgentToolCallsResult = UseQueryResult<
  AgentToolCallsResponse,
  Error
>

export function useAgentToolCalls(
  params: UseAgentToolCallsParams,
): UseAgentToolCallsResult {
  const { runId, enabled = true } = params
  const hasRunId = typeof runId === "string" && runId.length > 0
  return useQuery<AgentToolCallsResponse, Error>({
    queryKey: hasRunId
      ? agentKeys.toolCalls(runId)
      : agentKeys.runs(),
    queryFn: ({ signal }) =>
      getAgentToolCalls({ runId: runId as string, signal }),
    enabled: enabled && hasRunId,
    staleTime: 5 * 60_000,
    retry: (failureCount, error) => {
      if (error instanceof ApiError) {
        if (error.status === 404 || error.status === 403) return false
      }
      return failureCount < 2
    },
  })
}
