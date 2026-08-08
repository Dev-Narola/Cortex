/**
 * Get conversation (with messages) — `GET /conversations/{id}`.
 *
 * **F4 Part 1 (Task 4).** The V4 backend returns
 * `ConversationWithMessagesSchema` (conversation +
 * its messages). Per the spec, this is the single
 * endpoint the chat screen reads on mount.
 *
 * **Tenant isolation.** The backend enforces tenant
 * scope at the SQL level; the client just passes
 * the conversation id. A 404 means "not found OR
 * not yours" (the backend deliberately returns 404
 * to avoid leaking existence).
 *
 * **Cache key.** The hook layer uses
 * `["conversations", id]` so the list + detail
 * caches don't collide.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { Conversation } from "@/types/conversation"

export interface GetConversationParams {
  id: string
  signal?: AbortSignal
}

export async function getConversation({
  id,
  signal,
}: GetConversationParams): Promise<Conversation> {
  const client = getApiClient()
  return client.get<Conversation>(
    `/api/v1/conversations/${encodeURIComponent(id)}`,
    { signal },
  )
}
