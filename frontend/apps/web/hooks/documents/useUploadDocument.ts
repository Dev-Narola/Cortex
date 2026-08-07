/**
 * useUploadDocument — TanStack Mutation for uploads.
 *
 * **F3 Part 3 (Task 25).** The single mutation used
 * by the upload modal. On success we invalidate
 * the `["documents"]` query so the table refreshes
 * with the new row.
 *
 * **Optimistic update.** Skipped on purpose — the
 * `id` returned by the backend is required to show
 * the row, and the upload status is the
 * `DocumentStatus` from the server. A fake row with
 * a fake id would either need to be rolled back on
 * failure (extra complexity) or stay in the table
 * with broken detail-load. Invalidation is simpler
 * and the toast makes the latency feel small.
 *
 * **Progress.** The browser's `fetch` doesn't expose
 * upload progress; a future enhancement could swap
 * the underlying transport for `XMLHttpRequest` (which
 * has `upload.onprogress`) and surface it via the
 * mutation. Out of scope for Part 3.
 *
 * **Toasts.** Handled by the caller (the upload
 * modal) so the messaging is colocated with the
 * UI that the user just clicked. The mutation
 * only owns the data layer.
 */

"use client"

import { useMutation, type UseMutationResult } from "@tanstack/react-query"

import {
  uploadDocument,
  type UploadDocumentAccepted,
  type UploadDocumentParams,
} from "@/services/documents"

export type UseUploadDocumentResult = UseMutationResult<
  UploadDocumentAccepted,
  Error,
  UploadDocumentParams
>

export function useUploadDocument(): UseUploadDocumentResult {
  return useMutation<UploadDocumentAccepted, Error, UploadDocumentParams>({
    mutationFn: (params) => uploadDocument(params),
  })
}
