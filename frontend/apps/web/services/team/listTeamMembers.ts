/**
 * List team members — `GET /api/v1/users` (owner/admin only; 403 otherwise).
 * Returns the tenant's full roster as a bare array; the endpoint takes no
 * paging parameters.
 */
import { getApiClient } from "@/lib/auth/api-client"

import type { TeamListResponse } from "./types"

export interface ListTeamMembersParams {
  /** Optional abort signal (cancellation on unmount). */
  signal?: AbortSignal
}

export async function listTeamMembers(
  params: ListTeamMembersParams = {},
): Promise<TeamListResponse> {
  return getApiClient().get<TeamListResponse>(
    "/api/v1/users",
    params.signal ? { signal: params.signal } : {},
  )
}
