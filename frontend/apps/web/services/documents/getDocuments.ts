/**
 * Documents service — list documents.
 *
 * **F3 Part 2 (Task 12).** Wraps `GET /documents`.
 * The authenticated `ApiClient` is used (the request
 * inherits the Bearer token + the 401-refresh path).
 *
 * **No state.** Returns the parsed payload; the
 * caller hands it to TanStack Query.
 *
 * **Pagination.** The backend returns a
 * `PaginatedDocumentResponse` with `items`, `total`,
 * `limit`, `offset`. The service accepts the standard
 * `limit` + `offset` query params (default 50 / 0)
 * so the table can grow into pagination in a later
 * part without re-shaping the service.
 *
 * **Errors.** Same shape as the rest of the F2+
 * services — the api-client throws an `ApiError`
 * with a status + body. The hook layer maps to
 * `FrontendError` for the UI.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { Document, DocumentStatus } from "./types"

export interface GetDocumentsParams {
  /** Page size. Default 50. Max 200. */
  limit?: number
  /** Offset into the result set. Default 0. */
  offset?: number
  /** Optional status filter. */
  status?: DocumentStatus
}

export interface PaginatedDocuments {
  items: Document[]
  total: number
  limit: number
  offset: number
}

export async function getDocuments(
  params: GetDocumentsParams = {},
): Promise<PaginatedDocuments> {
  const client = getApiClient()
  const search = new URLSearchParams()
  if (params.limit !== undefined) search.set("limit", String(params.limit))
  if (params.offset !== undefined) search.set("offset", String(params.offset))
  if (params.status !== undefined) search.set("status", params.status)
  const qs = search.toString()
  const path = qs ? `/api/v1/documents?${qs}` : "/api/v1/documents"
  return client.get<PaginatedDocuments>(path)
}
