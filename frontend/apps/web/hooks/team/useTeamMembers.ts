/**
 * useTeamMembers — TanStack Query for the team roster.
 *
 * **F7 Part 1 (Task 26).** ``GET /api/v1/users`` via
 * the typed service. The hook follows the F0–F6
 * retry convention (transient errors only — 404/403
 * are real "endpoint missing" / "forbidden" states
 * and should surface to the user, not retry).
 *
 * **Disabled when unauthenticated.** The
 * `ApiClient` would 401 without a token; we still
 * gate the call so the panel doesn't fire a request
 * before the user has a session.
 *
 * **Stale time.** The team roster changes
 * infrequently; 60s is a safe default. The invite
 * mutation invalidates the list explicitly so the
 * panel refreshes immediately after a successful
 * invite.
 */
"use client"

import { type UseQueryResult, useQuery } from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import { type TeamListResponse, listTeamMembers } from "@/services/team"

import { teamKeys } from "./teamKeys"

export interface UseTeamMembersParams {
  /** Page size. Backend default 50, max 200. */
  limit?: number
  /** Zero-based offset. Backend default 0. */
  offset?: number
  /**
   * Caller-driven enable gate. Default `true`.
   * Used by the panel to skip the network call
   * before the user is authenticated.
   */
  enabled?: boolean
}

export type UseTeamMembersResult = UseQueryResult<TeamListResponse, Error>

export function useTeamMembers(params: UseTeamMembersParams = {}): UseTeamMembersResult {
  const { limit, offset, enabled = true } = params
  return useQuery<TeamListResponse, Error>({
    queryKey: teamKeys.members({ limit, offset }),
    queryFn: ({ signal }) => listTeamMembers({ limit, offset, signal }),
    enabled,
    retry: (failureCount, error) => {
      if (error instanceof ApiError) {
        // 404 (endpoint not yet implemented on
        // the backend) and 403 (caller isn't
        // allowed to see the roster) are real
        // states — don't retry, surface to the
        // panel. 401 is handled by the api-client's
        // silent-refresh path.
        if (error.status === 404 || error.status === 403) return false
      }
      return failureCount < 2
    },
    staleTime: 60_000,
  })
}
