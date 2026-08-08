/**
 * useConversation — TanStack Query for a single
 * conversation (with messages).
 *
 * **F4 Part 1 (Task 7).** Reads
 * `GET /conversations/{id}` which returns the
 * conversation + its messages in one round-trip.
 *
 * **Cache key.** `["conversations", id]`. The
 * future list query (F5) will use
 * `["conversations", "list", params]`. Keeping the
 * `id` as the second segment means a list
 * invalidation (`["conversations"]`) will also
 * catch detail caches.
 *
 * **`null` id.** The `/chat` (new conversation) route
 * doesn't have an id yet. The hook is disabled
 * (no fetch) until a real id is provided.
 *
 * **404 retry.** Disabled — a missing conversation
 * is a real state, not a transient failure.
 */

"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import { getConversation } from "@/services/conversations"
import type { Conversation } from "@/types/conversation"

export type UseConversationResult = UseQueryResult<Conversation, Error>

export function useConversation(
  id: string | null,
): UseConversationResult {
  return useQuery<Conversation, Error>({
    queryKey: ["conversations", id],
    queryFn: () => (id ? getConversation({ id }) : Promise.reject(new Error("no id"))),
    enabled: Boolean(id),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false
      return failureCount < 2
    },
    staleTime: 30_000,
  })
}
