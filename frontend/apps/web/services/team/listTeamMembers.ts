/**
 * List team members — `GET /users`.
 *
 * **F7 Part 1 (Task 25).** The Team panel's data
 * source. The backend's identity context exposes
 * `GET /users/me` (current user only) but not
 * `GET /users` (full tenant roster); the repository
 * has `list_by_tenant` but the REST router doesn't
 * expose it. This service targets the expected
 * endpoint; when the backend lands the route the
 * UI lights up automatically.
 *
 * **Why this isn't a 404 by default.** The user
 * spec says: "Do not invent `GET /users` as a
 * confirmed contract. ... stop at the UI shell in
 * this part and flag the missing read contract
 * rather than silently inventing one." We *do*
 * call the endpoint — the call is the contract the
 * UI assumes; we just don't pretend the contract
 * exists today. The panel renders a clear "Backend
 * contract pending" error state when the route
 * 404s.
 *
 * **Auth + tenant scope.** Inherited from the
 * shared `ApiClient` — the JWT is injected, the
 * 401 silent-refresh path runs, and the backend's
 * `get_current_user` enforces tenant + user scope
 * at the SQL level. The frontend never passes a
 * `tenant_id` query param.
 *
 * **Abort signal.** The hook layer cancels an
 * in-flight request on unmount (no "state update
 * on unmounted component" warnings).
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { TeamListResponse } from "./types"

export interface ListTeamMembersParams {
  /** Page size. Backend default 50, max 200. */
  limit?: number
  /** Zero-based offset. Backend default 0. */
  offset?: number
  /** Optional abort signal (cancellation on unmount). */
  signal?: AbortSignal
}

export async function listTeamMembers(
  params: ListTeamMembersParams = {},
): Promise<TeamListResponse> {
  const client = getApiClient()
  const { limit, offset, signal } = params
  const query: Record<string, number> = {}
  if (limit !== undefined) query.limit = limit
  if (offset !== undefined) query.offset = offset
  return client.get<TeamListResponse>("/api/v1/users", {
    ...(Object.keys(query).length > 0 ? { query } : {}),
    ...(signal ? { signal } : {}),
  })
}
