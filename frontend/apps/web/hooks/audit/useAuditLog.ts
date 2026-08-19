/**
 * useAuditLog — TanStack Query for the
 * paginated audit log list.
 *
 * **F7 Part 5.** ``GET /api/v1/audit-log``
 * via the typed service. The hook is the
 * data source for the Audit Log table.
 *
 * **Stale time.** 30s — audit data is
 * append-only and a new event may land at
 * any time. The query auto-refreshes on
 * window focus per the project's global
 * TanStack Query config. The Settings page
 * also invalidates the query after a
 * mutation elsewhere (e.g. revoking an API
 * key) so a freshly recorded event shows
 * up without a manual refresh.
 *
 * **Owner/admin only.** The hook layer
 * doesn't gate by role — the backend
 * returns 403 for member/viewer and the UI
 * surfaces that as the standard ErrorState.
 * (The SettingsTabs in the parent layout
 * hides the tab for member/viewer so the
 * unauthorised state is only hit on direct
 * URL navigation.)
 */
"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { getAuditLog, type AuditEventListResponse, type GetAuditLogParams } from "@/services/audit"

import { auditKeys } from "./auditKeys"

export interface UseAuditLogParams extends Omit<GetAuditLogParams, "signal"> {
  /**
   * Caller-driven enable gate. Default
   * `true`. The SettingsTabs may pass
   * `false` for member/viewer so the
   * request never goes out (and the user
   * never sees a 403 they can't act on).
   */
  enabled?: boolean
}

export type UseAuditLogResult = UseQueryResult<AuditEventListResponse, Error>

export function useAuditLog(
  params: UseAuditLogParams = {},
): UseAuditLogResult {
  const { enabled = true, ...rest } = params
  // Strip `signal` from the queryKey so the
  // signal identity never causes a refetch.
  const {
    cursor,
    limit,
    action,
    resource_type,
    actor_user_id,
    start_date,
    end_date,
  } = rest
  return useQuery<AuditEventListResponse, Error>({
    queryKey: auditKeys.list({
      ...(cursor !== undefined ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(action !== undefined ? { action } : {}),
      ...(resource_type !== undefined ? { resource_type } : {}),
      ...(actor_user_id !== undefined ? { actor_user_id } : {}),
      ...(start_date !== undefined ? { start_date } : {}),
      ...(end_date !== undefined ? { end_date } : {}),
    }),
    queryFn: ({ signal }) =>
      getAuditLog({
        ...(cursor !== undefined ? { cursor } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(action !== undefined ? { action } : {}),
        ...(resource_type !== undefined ? { resource_type } : {}),
        ...(actor_user_id !== undefined ? { actor_user_id } : {}),
        ...(start_date !== undefined ? { start_date } : {}),
        ...(end_date !== undefined ? { end_date } : {}),
        signal,
      }),
    enabled,
    staleTime: 30_000,
  })
}
