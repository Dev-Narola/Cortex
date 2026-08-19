/**
 * Invite a team member — `POST /users/invite`.
 *
 * **F7 Part 1 (Task 25).** The invite mutation. Same
 * backend-pending status as `listTeamMembers` — the
 * endpoint is not in the current backend; the service
 * is wired so the UI is fully functional the moment
 * the route ships.
 *
 * **Why a separate service.** F0–F6 follow the
 * "one service file per backend action" pattern
 * (`services/conversations/listConversations.ts`,
 * `services/documents/uploadDocument.ts`, etc.). The
 * invite service follows the same shape: request →
 * response → `ApiError` on failure. Components never
 * call `fetch` directly.
 *
 * **Auth + tenant scope.** Same as `listTeamMembers`:
 * the JWT is injected, the backend's tenant guard
 * enforces the scope, and the inviter must be
 * `owner` or `admin` (the backend's authorization
 * check is the source of truth — a non-admin
 * inviter gets a 403, not a UI-side gate bypass).
 *
 * **No `tenant_id` in the body.** Tenant identity
 * comes from the JWT. The frontend never sends it.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { InviteMemberRequest, InviteMemberResponse } from "./types"

export interface InviteMemberParams extends InviteMemberRequest {
  /** Optional abort signal (cancellation on unmount / modal close). */
  signal?: AbortSignal
}

export async function inviteMember(params: InviteMemberParams): Promise<InviteMemberResponse> {
  const client = getApiClient()
  const { signal, ...body } = params
  return client.post<InviteMemberResponse>("/api/v1/users/invite", body, {
    ...(signal ? { signal } : {}),
  })
}
