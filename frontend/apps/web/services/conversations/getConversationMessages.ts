/**
 * Get conversation messages — `GET /conversations/{id}/messages`.
 *
 * **F4 Part 1 (Task 4).** The V4 backend exposes
 * this as a sibling endpoint; the F4 chat screen
 * reads it when the user is on the detail route
 * and wants to refresh just the messages (e.g.
 * after a websocket token stream completes in
 * Part 2).
 *
 * **Use sparingly.** For the initial load, prefer
 * `getConversation()` which returns the conversation
 * + messages in a single request. This endpoint
 * is for partial refreshes.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { Message } from "@/types/conversation"

export interface GetConversationMessagesParams {
  id: string
  limit?: number
  signal?: AbortSignal
}

export async function getConversationMessages({
  id,
  limit = 200,
  signal,
}: GetConversationMessagesParams): Promise<Message[]> {
  const client = getApiClient()
  return client.get<Message[]>(
    `/api/v1/conversations/${encodeURIComponent(id)}/messages`,
    { query: { limit }, signal },
  )
}
