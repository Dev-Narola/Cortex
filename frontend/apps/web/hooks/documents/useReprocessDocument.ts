/**
 * useReprocessDocument — TanStack Mutation for re-ingestion.
 *
 * **F3 Part 3 (Task 29).** Hits
 * `POST /documents/{id}/reprocess`. On success we
 * invalidate `["documents"]` so the table picks up
 * the new server-side state on refetch.
 *
 * **Live status.** The backend bumps the version +
 * resets the status to `pending` async; the live
 * status progression is delivered by the WebSocket
 * (Part 4). Until then, the invalidate-on-success
 * covers the immediate "I queued this" feedback.
 */

"use client"

import { useMutation, type UseMutationResult } from "@tanstack/react-query"

import {
  reprocessDocument,
  type ReprocessDocumentParams,
  type ReprocessDocumentResponse,
} from "@/services/documents"

export type UseReprocessDocumentResult = UseMutationResult<
  ReprocessDocumentResponse,
  Error,
  ReprocessDocumentParams
>

export function useReprocessDocument(): UseReprocessDocumentResult {
  return useMutation<ReprocessDocumentResponse, Error, ReprocessDocumentParams>({
    mutationFn: (params) => reprocessDocument(params),
  })
}
