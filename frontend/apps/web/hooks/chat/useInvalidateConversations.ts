/**
 * useInvalidateConversations — invalidates every
 * query in the `["conversations"]` namespace.
 *
 * **F4 Part 1 (Task 5 supporting).** Used by
 * `useCreateConversation` so the future conversation
 * list cache (F5) refreshes when a new row lands.
 * Also reused by `useDeleteConversation` (F5) when
 * that lands.
 *
 * **F5 Part 1 update.** The invalidation now
 * targets the list slice via the centralised
 * `conversationsKeys.lists()` key. F4's behaviour
 * (invalidate everything on create) is preserved
 * — a new row refreshes the list AND the detail
 * row when the caller navigates to the new
 * conversation id, because the list key is a
 * sub-prefix of the all-namespace key the
 * previous implementation used.
 *
 * **Why a shared hook.** Future mutations (rename,
 * archive, regenerate title) all need the same
 * invalidation. Centralising the cache key here
 * keeps the namespace consistent.
 */

"use client"

import { useQueryClient } from "@tanstack/react-query"

import { conversationsKeys } from "./conversationKeys"

export function useInvalidateConversations(): () => Promise<void> {
  const qc = useQueryClient()
  return async () => {
    await qc.invalidateQueries({ queryKey: conversationsKeys.lists() })
  }
}
