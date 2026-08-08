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
 * **Why a shared hook.** Future mutations (rename,
 * archive, regenerate title) all need the same
 * invalidation. Centralising the cache key here
 * keeps the namespace consistent.
 */

"use client"

import { useQueryClient } from "@tanstack/react-query"

export function useInvalidateConversations(): () => Promise<void> {
  const qc = useQueryClient()
  return async () => {
    await qc.invalidateQueries({ queryKey: ["conversations"] })
  }
}
