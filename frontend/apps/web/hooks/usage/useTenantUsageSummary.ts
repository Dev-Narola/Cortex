/**
 * useTenantUsageSummary — TanStack Query for the
 * flat dashboard cards.
 *
 * **F7 Part 4.** ``GET /tenants/me/usage/summary``
 * via the typed service. The hook is the data
 * source for the Usage & Billing summary
 * section.
 *
 * **Stale time.** 30s — usage data changes
 * slowly (a new event every few minutes at
 * most). The query auto-refreshes on window
 * focus per the project's global TanStack
 * Query config.
 */
"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { getTenantUsageSummary, type UsageSummary } from "@/services/usage"

import { usageKeys } from "./usageKeys"

export interface UseTenantUsageSummaryParams {
  /** Optional period override. The UI passes
   *  `undefined` to use the backend's default
   *  ("current calendar month to now"). */
  period_start?: string
  period_end?: string
  /**
   * Caller-driven enable gate. Default `true`.
   * Used by the panel to skip the network
   * call before the user is authenticated.
   */
  enabled?: boolean
}

export type UseTenantUsageSummaryResult = UseQueryResult<UsageSummary, Error>

export function useTenantUsageSummary(
  params: UseTenantUsageSummaryParams = {},
): UseTenantUsageSummaryResult {
  const { period_start, period_end, enabled = true } = params
  return useQuery<UsageSummary, Error>({
    queryKey: usageKeys.summary({ period_start, period_end }),
    queryFn: ({ signal }) =>
      getTenantUsageSummary({
        ...(period_start !== undefined ? { period_start } : {}),
        ...(period_end !== undefined ? { period_end } : {}),
        signal,
      }),
    enabled,
    staleTime: 30_000,
  })
}
