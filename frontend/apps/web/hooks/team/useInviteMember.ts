/**
 * useInviteMember — TanStack Query mutation for inviting a teammate.
 *
 * **F7 Part 1 (Tasks 25, 26).** ``POST /api/v1/users/invite`` via
 * the typed service. The mutation invalidates the team
 * list on success so the panel refreshes without a
 * manual reload.
 *
 * **On-success behaviour.** The mutation:
 *   1. Invalidates `teamKeys.members()` so the panel
 *      re-fetches the roster (the new invitee will
 *      appear once the backend commits the row).
 *   2. Returns the response so the modal can show
 *      a "Invitation sent" toast.
 *
 * **Form-error mapping.** The mutation propagates
 * the raw ``ApiError`` to the caller. The modal
 * inspects ``error.status`` to render a useful
 * message: 422 → invalid email / role, 403 → the
 * current user is no longer admin, 409 → the
 * email is already a member.
 */
"use client"

import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query"

import { type InviteMemberParams, type InviteMemberResponse, inviteMember } from "@/services/team"

import { teamKeys } from "./teamKeys"

export type UseInviteMemberResult = UseMutationResult<
  InviteMemberResponse,
  Error,
  InviteMemberParams
>

export function useInviteMember(): UseInviteMemberResult {
  const queryClient = useQueryClient()
  return useMutation<InviteMemberResponse, Error, InviteMemberParams>({
    mutationFn: (params) => inviteMember(params),
    onSuccess: () => {
      // The roster may have changed (the new
      // member is in flight on the backend; the
      // server is the source of truth for the
      // membership state). The list query is the
      // canonical cache entry — invalidate it
      // once, the panel re-fetches.
      void queryClient.invalidateQueries({ queryKey: teamKeys.members() })
    },
  })
}
