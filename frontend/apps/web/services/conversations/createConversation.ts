/**
 * Create conversation — `POST /conversations`.
 *
 * **F4 Part 1 (Task 4).** The backend requires a
 * non-empty `title` (1-512 chars). For Part 1, the
 * client sends a placeholder title (Part 2 will
 * replace this with the first-message excerpt).
 *
 * **Why no optimistic mutation.** The spec explicitly
 * says "Don't store the newly created conversation
 * only in local React state" — server data lives in
 * TanStack Query. The mutation returns the created
 * record; the hook layer invalidates the list cache
 * and navigates to the new id.
 *
 * **Response shape.** The V4 backend returns
 * `ConversationSchema` (no messages). The frontend
 * type is `CreateConversationResponse`; consumers that
 * need the messages call `getConversation()`.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { CreateConversationRequest, CreateConversationResponse } from "@/types/conversation"

export type CreateConversationParams = CreateConversationRequest

export async function createConversation(
  params: CreateConversationParams,
): Promise<CreateConversationResponse> {
  const client = getApiClient()
  return client.post<CreateConversationResponse>(
    "/api/v1/conversations",
    params as never,
  )
}
