/**
 * useConversations — TanStack Query hook for the
 * conversation history list.
 *
 * **F5 Part 1 (Task 5).** Single hook for every
 * component that reads the conversation list.
 *
 * **Architecture.**
 *   Component (ConversationList)
 *     ↓
 *   useConversations()
 *     ↓
 *   TanStack Query (key: `conversationsKeys.list({limit})`)
 *     ↓
 *   listConversations() — `lib/api/conversations.ts`
 *     ↓
 *   GET /conversations
 *
 * **Stale time.** The list is "background state" —
 * the user is reading it but won't notice a
 * 30-second stale entry. The 30s window keeps
 * the cache warm across the typical
 * "open conversation → click another →
 * return" round-trip.
 *
 * **Retry.** Two retries on transient errors
 * (network blip, 5xx). 404 is a real state
 * (the user was deleted, the tenant was
 * archived) and we don't retry it.
 *
 * **No polling.** The spec is explicit: no
 * periodic refetch. New conversations +
 * renames invalidate the list explicitly via
 * `useCreateConversation` (today) +
 * `useRenameConversation` (Part 2).
 *
 * **Tenant isolation.** The backend enforces
 * tenant + user scope at the SQL level via
 * `get_current_user`. The frontend never
 * accepts an arbitrary id; the URL
 * `/chat/{id}` is the only way the user reaches
 * a detail, and the backend's 404 path is the
 * security boundary.
 */

"use client"

import {
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import { listConversations } from "@/services/conversations"
import type { ConversationListResponse } from "@/types/conversation"

import { conversationsKeys } from "./conversationKeys"

export interface UseConversationsParams {
  /** Page size. Defaults to 50 (the backend default). */
  limit?: number
  /** Zero-based offset. Defaults to 0. */
  offset?: number
  /**
   * Disable the query entirely. Useful when the
   * user is signed out (the api-client would 401
   * otherwise) or when the chat route is being
   * loaded as part of a marketing flow.
   */
  enabled?: boolean
}

export type UseConversationsResult = UseQueryResult<
  ConversationListResponse,
  Error
>

export function useConversations(
  params: UseConversationsParams = {},
): UseConversationsResult {
  const { limit, offset, enabled = true } = params
  return useQuery<ConversationListResponse, Error>({
    queryKey: conversationsKeys.list({ limit, offset }),
    queryFn: ({ signal }) =>
      listConversations({
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
        signal,
      }),
    enabled,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      // 404 + 403 are real authorisation states;
      // 401 is handled by the api-client's silent
      // refresh path. Everything else is transient.
      if (error instanceof ApiError) {
        if (error.status === 404 || error.status === 403) return false
      }
      return failureCount < 2
    },
  })
}
