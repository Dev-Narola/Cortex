/**
 * useTenantUsage — TanStack Query for the
 * per-event-type aggregate.
 *
 * **F7 Part 4.** ``GET /tenants/me/usage`` via
 * the typed service. The hook is the data
 * source for the breakdown section
 * (per-event `tokens` + `cost_usd`).
 *
 * **Stale time.** 30s, matching the summary
 * hook (the two queries read the same
 * underlying data with the same refresh
 * cadence).
 */
"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import {
  getTenantUsage,
  type TenantUsageAggregate,
} from "@/services/usage"

import { usageKeys } from "./usageKeys"

export interface UseTenantUsageParams {
  period_start?: string
  period_end?: string
  /** Default `true`. See useTenantUsageSummary. */
  enabled?: boolean
}

export type UseTenantUsageResult = UseQueryResult<TenantUsageAggregate, Error>

export function useTenantUsage(
  params: UseTenantUsageParams = {},
): UseTenantUsageResult {
  const { period_start, period_end, enabled = true } = params
  return useQuery<TenantUsageAggregate, Error>({
    queryKey: usageKeys.aggregate({ period_start, period_end }),
    queryFn: ({ signal }) =>
      getTenantUsage({
        ...(period_start !== undefined ? { period_start } : {}),
        ...(period_end !== undefined ? { period_end } : {}),
        signal,
      }),
    enabled,
    staleTime: 30_000,
  })
}
