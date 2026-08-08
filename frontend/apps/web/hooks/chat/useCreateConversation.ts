/**
 * useCreateConversation — TanStack Mutation for new
 * conversations.
 *
 * **F4 Part 1 (Task 5).** The mutation:
 *   1. Calls `POST /conversations` with a placeholder
 *      title (Part 2 will replace this with the
 *      first-message excerpt).
 *   2. On success, invalidates the list cache so the
 *      future conversation list (F5) refreshes.
 *   3. Returns the created conversation so the page
 *      can `router.push("/chat/{id}")`.
 *
 * **No optimistic state.** The spec is explicit:
 * server data lives in TanStack Query. The mutation
 * doesn't write to any cache until the server
 * responds; the page navigates after the response
 * is in hand.
 *
 * **Title strategy.** Part 1 sends a fixed
 * placeholder. The auto-rename (Part 2 / F5) can
 * either generate a title from the first message
 * (client-side) or rewrite it server-side. The
 * placeholder keeps the contract stable.
 *
 * **Return type.** `UseMutationResult` is a TanStack
 * type alias (not an interface), so we re-export
 * it as a plain `type` rather than `extends`.
 */

"use client"

import { useMutation, type UseMutationResult } from "@tanstack/react-query"

import { useInvalidateConversations } from "./useInvalidateConversations"
import {
  createConversation,
  type CreateConversationParams,
} from "@/services/conversations"
import type { CreateConversationResponse } from "@/types/conversation"

export type UseCreateConversationResult = UseMutationResult<
  CreateConversationResponse,
  Error,
  CreateConversationParams
>

export function useCreateConversation(): UseCreateConversationResult {
  const invalidate = useInvalidateConversations()
  return useMutation<
    CreateConversationResponse,
    Error,
    CreateConversationParams
  >({
    mutationFn: (params) => createConversation(params),
    onSuccess: () => {
      // The future conversation list (F5) will read
      // from this namespace. We invalidate eagerly
      // so even Part 1's pre-fetch (if any) sees the
      // new row.
      void invalidate()
    },
  })
}
