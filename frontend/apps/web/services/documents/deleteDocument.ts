/**
 * Delete document — `DELETE /documents/{id}`.
 *
 * **F3 Part 3 (Task 28).** Returns void on success
 * (the backend responds with `204 No Content`). Any
 * non-2xx response surfaces as an `ApiError`.
 *
 * **Auth.** Goes through the api-client so the
 * Bearer + 401-refresh path is inherited.
 */

import { getApiClient } from "@/lib/auth/api-client"

export interface DeleteDocumentParams {
  id: string
  signal?: AbortSignal
}

export async function deleteDocument({
  id,
  signal,
}: DeleteDocumentParams): Promise<void> {
  const client = getApiClient()
  await client.delete<void>(`/api/v1/documents/${encodeURIComponent(id)}`, {
    signal,
  })
}
