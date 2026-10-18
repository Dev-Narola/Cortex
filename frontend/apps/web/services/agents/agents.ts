/**
 * Agents CRUD + execution — `/api/v1/agents`.
 */

import { getApiClient } from "@/lib/auth/api-client"

export interface Agent {
  id: string
  name: string
  description: string
  system_prompt: string
  model: string
  status: "active" | "inactive" | "archived"
  configuration: { max_iterations: number; temperature: number; max_tokens: number }
  created_at: string
  updated_at: string
}

export interface AgentList {
  items: Agent[]
  total: number
}

export interface CreateAgentInput {
  name: string
  description: string
  system_prompt: string
  model: string
}

export interface ExecuteAgentResult {
  run_id: string
  status: string
  result: string
  iterations: number
  tool_calls: number
  stop_reason: string | null
}

export function listAgents(signal?: AbortSignal) {
  return getApiClient().get<AgentList>("/api/v1/agents", {
    query: { limit: 100 },
    ...(signal ? { signal } : {}),
  })
}

export function createAgent(input: CreateAgentInput) {
  return getApiClient().post<Agent>("/api/v1/agents", input)
}

export function deleteAgent(id: string) {
  return getApiClient().delete<void>(`/api/v1/agents/${encodeURIComponent(id)}`)
}

/** Synchronous run: resolves when the agent loop finishes (or hits its limits). */
export function executeAgent(id: string, message: string) {
  return getApiClient().post<ExecuteAgentResult>(
    `/api/v1/agents/${encodeURIComponent(id)}/execute`,
    { message },
  )
}
