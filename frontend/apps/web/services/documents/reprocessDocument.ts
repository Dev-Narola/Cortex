/**
 * Reprocess document — `POST /documents/{id}/reprocess`.
 *
 * **F3 Part 3 (Task 29).** Forces a re-ingestion of
 * an already-indexed document (bumps the version +
 * resets the status to `pending`). The backend
 * responds with `202 Accepted` + a message body.
 *
 * **Live status.** The status flip happens async on
 * the backend; the WebSocket (Part 4) will push the
 * new status to the table. Until then, the table
 * query cache is invalidated so the user sees the
 * server-side state on the next refetch.
 */

import { getApiClient } from "@/lib/auth/api-client"

export interface ReprocessDocumentParams {
  id: string
  signal?: AbortSignal
}

export interface ReprocessDocumentResponse {
  message: string
}

export async function reprocessDocument({
  id,
  signal,
}: ReprocessDocumentParams): Promise<ReprocessDocumentResponse> {
  const client = getApiClient()
  return client.post<ReprocessDocumentResponse>(
    `/api/v1/documents/${encodeURIComponent(id)}/reprocess`,
    undefined,
    { signal },
  )
}
