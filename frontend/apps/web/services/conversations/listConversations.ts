/**
 * List conversations — `GET /conversations`.
 *
 * **F5 Part 1 (Task 3).** The F4 chat screen never
 * needed a list of conversations; the user opened
 * one via the "New chat" CTA, which created a
 * fresh row on the server and navigated to it.
 *
 * F5 introduces a left-hand history panel. This
 * service is the single place the panel reads
 * from. The backend's `GET /conversations`
 * returns a paginated envelope
 * (`{ items, total, limit, offset }`) ordered by
 * `updated_at` desc; Part 1 renders a flat list
 * with no paging controls (the spec's history
 * pane is "ChatGPT-style" — newest at the top,
 * scroll for older).
 *
 * **Auth + tenant scope.** The same
 * `getApiClient()` singleton the F4 services use
 * — the JWT is injected automatically, the 401
 * silent-refresh path runs on every request, and
 * the backend's `get_current_user` enforces
 * tenant + user scope at the SQL level. The
 * frontend never accepts an arbitrary id; the
 * backend returns 404 for "not found OR not
 * yours" to avoid leaking existence.
 *
 * **Pagination args.** Optional. The backend
 * defaults to `limit=50, offset=0`. The hook
 * layer passes a single `limit=50` for the
 * initial render; Part 2's archive + search
 * will add cursor support.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { ConversationListResponse } from "@/types/conversation"

export interface ListConversationsParams {
  /** Page size. Backend default 50, max 200. */
  limit?: number
  /** Zero-based offset. Backend default 0. */
  offset?: number
  /** Optional abort signal (cancellation on unmount). */
  signal?: AbortSignal
}

export async function listConversations(
  params: ListConversationsParams = {},
): Promise<ConversationListResponse> {
  const client = getApiClient()
  const { limit, offset, signal } = params
  const query: Record<string, number> = {}
  if (limit !== undefined) query.limit = limit
  if (offset !== undefined) query.offset = offset
  return client.get<ConversationListResponse>("/api/v1/conversations", {
    ...(Object.keys(query).length > 0 ? { query } : {}),
    ...(signal ? { signal } : {}),
  })
}
