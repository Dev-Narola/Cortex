/**
 * useApiKeys — TanStack Query for the API key list.
 *
 * **F7 Part 2 (Task 5).** ``GET /api/v1/api-keys`` via
 * the typed service. Follows the F0–F6 retry
 * convention (transient errors only — 401 is handled
 * by the api-client's silent-refresh path).
 *
 * **Disabled when unauthenticated.** We refuse to
 * fire the request before the user has a session
 * (otherwise the panel would briefly show an
 * "unauthorized" error on first paint).
 *
 * **Stale time.** 30s — the list changes rarely
 * (only when the user creates or revokes a key,
 * which they just did and is already invalidating
 * the query). The panel's UX is fine with a 30s
 * warm cache; the create / revoke mutations
 * invalidate explicitly on success.
 */
"use client"

import { type UseQueryResult, useQuery } from "@tanstack/react-query"

import { type ApiKeyList, listApiKeys } from "@/services/api-keys"

import { apiKeyKeys } from "./apiKeyKeys"

export interface UseApiKeysParams {
  /** Whether to include revoked keys. Default
   *  `false` (the panel's "Active" view). */
  include_revoked?: boolean
  /**
   * Caller-driven enable gate. Default `true`.
   * Used by the panel to skip the network call
   * before the user is authenticated.
   */
  enabled?: boolean
}

export type UseApiKeysResult = UseQueryResult<ApiKeyList, Error>

export function useApiKeys(params: UseApiKeysParams = {}): UseApiKeysResult {
  const { include_revoked = false, enabled = true } = params
  return useQuery<ApiKeyList, Error>({
    queryKey: apiKeyKeys.list({ include_revoked }),
    queryFn: ({ signal }) =>
      listApiKeys({
        include_revoked,
        signal,
      }),
    enabled,
    staleTime: 30_000,
  })
}
