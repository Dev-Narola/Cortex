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

import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@cortex/api-client"

import {
  type TeamListResponse,
  type UpdateMemberRequest,
  listTeamMembers,
  updateMember,
} from "@/services/team"

import { teamKeys } from "./teamKeys"

export interface UseTeamMembersParams {
  /** Caller-driven enable gate. Default `true`. */
  enabled?: boolean
}

export type UseTeamMembersResult = UseQueryResult<TeamListResponse, Error>

export function useTeamMembers(params: UseTeamMembersParams = {}): UseTeamMembersResult {
  const { enabled = true } = params
  return useQuery<TeamListResponse, Error>({
    queryKey: teamKeys.members(),
    queryFn: ({ signal }) => listTeamMembers({ signal }),
    enabled,
    retry: (failureCount, error) => {
      // 403 (caller isn't owner/admin) is a real state; 401 is handled by the
      // api-client's silent refresh. Everything else is transient.
      if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return false
      return failureCount < 2
    },
    staleTime: 60_000,
  })
}

export function useUpdateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateMemberRequest) => updateMember(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamKeys.members() }),
  })
}
