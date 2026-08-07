/**
 * useDocuments — TanStack Query for the document list.
 *
 * **F3 Part 2 (Task 13).** Single source of truth
 * for the documents table. The page calls
 * `useDocuments({ limit, offset, status })` and the
 * returned `data` flows into `DocumentsTable`.
 *
 * **Cache key.** `["documents", params]` — re-fetches
 * when any param changes. The future WebSocket (Part 4)
 * can invalidate this key to push live updates.
 *
 * **staleTime.** 30s — documents don't change
 * frequently, so we don't hammer the backend.
 * `refetchOnWindowFocus: true` (the default) so a
 * focus after a long pause picks up server-side
 * changes (e.g. status flips from `pending` → `indexed`).
 */

"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import {
  getDocuments,
  type GetDocumentsParams,
  type PaginatedDocuments,
} from "@/services/documents"

export type UseDocumentsResult = UseQueryResult<PaginatedDocuments, Error>

export function useDocuments(
  params: GetDocumentsParams = {},
): UseDocumentsResult {
  return useQuery<PaginatedDocuments, Error>({
    queryKey: ["documents", params],
    queryFn: () => getDocuments(params),
    staleTime: 30_000,
  })
}
