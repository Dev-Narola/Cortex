/**
 * Rename conversation — `PATCH /conversations/{id}`.
 *
 * **F5 Part 2 (Task 5).** The V3 domain entity
 * already had a `rename(new_title)` mutator; this
 * is the REST surface that exposes it. The F4
 * chat created conversations with a placeholder
 * title; the F5 inline rename is the user's
 * way to give them a real name.
 *
 * **Why a service (not a hook).** The hook layer
 * owns the TanStack mutation + cache
 * invalidation. The service is the single
 * place that knows the URL + the request shape
 * + the response type. Components never call
 * this directly — only the hook does.
 *
 * **Title normalisation.** The backend trims
 * + validates (1-512 chars). The client also
 * trims before sending (the F4 schema is
 * already strict about whitespace) so the
 * "Conversation name can't be empty" UX is
 * surfaced client-side as well as server-side.
 *
 * **Auth + tenant scope.** Same singleton
 * `getApiClient()` the other conversation
 * services use. The backend's
 * `get_current_user` enforces tenant + user
 * scope at the SQL level. A 404 from this
 * endpoint means "not found OR not yours" —
 * the frontend never sees the difference.
 *
 * **Response.** The backend returns the
 * updated `Conversation` (with the new title +
 * the bumped `updated_at`). The hook uses the
 * response to patch the conversation cache in
 * place, so the title appears immediately
 * without a follow-up refetch.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { Conversation } from "@/types/conversation"

export interface RenameConversationParams {
  id: string
  title: string
}

export async function renameConversation(
  params: RenameConversationParams,
): Promise<Conversation> {
  const client = getApiClient()
  return client.patch<Conversation>(
    `/api/v1/conversations/${encodeURIComponent(params.id)}`,
    { title: params.title } as never,
  )
}
