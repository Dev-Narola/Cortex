"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  type CreateAgentInput,
  createAgent,
  deleteAgent,
  executeAgent,
  listAgents,
} from "@/services/agents"

import { agentKeys } from "./agentKeys"

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.list(),
    queryFn: ({ signal }) => listAgents(signal),
    staleTime: 30_000,
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAgentInput) => createAgent(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.list() }),
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteAgent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentKeys.list() }),
  })
}

export function useExecuteAgent() {
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) => executeAgent(id, message),
  })
}
