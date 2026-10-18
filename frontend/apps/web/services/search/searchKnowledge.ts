/**
 * `POST /api/v1/search` — hybrid retrieval (full-text + vector, fused, then
 * reranked) over the tenant's indexed chunks.
 */

import { getApiClient } from "@/lib/auth/api-client"

export interface SearchResult {
  chunk_id: string
  document_id: string
  document_title: string | null
  content: string
  score: number
  chunk_index: number
  metadata: Record<string, unknown>
}

export interface SearchResponse {
  results: SearchResult[]
  query: string
}

/** Backend bounds: query 1–2048 chars, limit 1–50. */
export async function searchKnowledge(
  query: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  return getApiClient().post<SearchResponse>(
    "/api/v1/search",
    { query, limit },
    signal ? { signal } : {},
  )
}
