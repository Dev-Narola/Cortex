/**
 * Delete conversation — `DELETE /conversations/{id}`.
 *
 * **F5 Part 2 (Task 6).** The backend's
 * `ConversationRepository.delete` cascades to
 * the conversation's messages (per the V3
 * design), so a successful 204 leaves no
 * orphan rows. The frontend treats the
 * operation as fire-and-forget: the response
 * carries no body, the cache is patched in
 * the hook layer.
 *
 * **Auth + tenant scope.** Same singleton
 * `getApiClient()` the other conversation
 * services use. The backend's
 * `get_current_user` enforces tenant + user
 * scope at the SQL level. A 404 means
 * "not found OR not yours" — the frontend
 * never sees the difference.
 *
 * **Permission gate.** The UI hides the Delete
 * action for `viewer` role users (per the
 * UI/UX cross-cutting rule). The backend
 * remains the final authorisation boundary —
 * if a viewer ever gets the action, the
 * backend will return 403 and the hook
 * surfaces the error to the user.
 *
 * **Return type.** `void` — the backend
 * responds with `204 No Content` (see
 * `routes.py:delete_conversation`). The hook
 * layer doesn't read a return value; it
 * invalidates the list cache + navigates
 * the caller off the deleted route.
 */

import { getApiClient } from "@/lib/auth/api-client"

export interface DeleteConversationParams {
  id: string
}

export async function deleteConversation(
  params: DeleteConversationParams,
): Promise<void> {
  const client = getApiClient()
  await client.delete<void>(
    `/api/v1/conversations/${encodeURIComponent(params.id)}`,
  )
}
