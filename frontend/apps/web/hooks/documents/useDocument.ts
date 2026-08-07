/**
 * useDocument — TanStack Query for a single document.
 *
 * **F3 Part 2 (Task 13).** Triggered by the
 * `DocumentSelectionProvider` when a row is selected.
 * The hook is `enabled: false` by default — the
 * provider turns it on once an `id` is set.
 *
 * **Cache key.** `["documents", id]` — shares the
 * namespace with the list query so a `queryClient.
 * invalidateQueries({ queryKey: ["documents"] })`
 * refetches both.
 *
 * **Retry.** Disabled for 404s (the document was
 * deleted) — we don't want a 404 to retry forever.
 */

"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import { getDocument, type Document } from "@/services/documents"

export type UseDocumentResult = UseQueryResult<Document | null, Error>

export function useDocument(id: string | null): UseDocumentResult {
  return useQuery<Document | null, Error>({
    queryKey: ["documents", id],
    queryFn: () => (id ? getDocument(id) : Promise.resolve(null)),
    // `null` ID is a no-op — the page doesn't need to
    // refetch when no row is selected.
    enabled: Boolean(id),
    // Don't retry 404s — the document is gone.
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false
      return failureCount < 2
    },
    staleTime: 30_000,
  })
}
