/**
 * useTenantUsageEvents — TanStack Query for the
 * recent-events list.
 *
 * **F7 Part 4.** ``GET /tenants/me/usage/events``
 * via the typed service. The hook is the
 * data source for the "Usage history" table
 * (newest first, per the backend's ordering).
 */
"use client"

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import {
  getTenantUsageEvents,
  type UsageEvent,
} from "@/services/usage"

import { usageKeys } from "./usageKeys"

export interface UseTenantUsageEventsParams {
  /** Page size. Backend default 50, max 500. */
  limit?: number
  /** Optional event-type filter. */
  event_type?: string
  /** Default `true`. */
  enabled?: boolean
}

export type UseTenantUsageEventsResult = UseQueryResult<
  ReadonlyArray<UsageEvent>,
  Error
>

export function useTenantUsageEvents(
  params: UseTenantUsageEventsParams = {},
): UseTenantUsageEventsResult {
  const { limit = 50, event_type, enabled = true } = params
  return useQuery<ReadonlyArray<UsageEvent>, Error>({
    queryKey: usageKeys.events({ limit, event_type }),
    queryFn: ({ signal }) =>
      getTenantUsageEvents({
        limit,
        ...(event_type !== undefined ? { event_type } : {}),
        signal,
      }),
    enabled,
    staleTime: 30_000,
  })
}
