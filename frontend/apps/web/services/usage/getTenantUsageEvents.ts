/**
 * Get the tenant's raw usage events —
 * `GET /tenants/me/usage/events`.
 *
 * **F7 Part 4.** The "Usage history" table
 * data source. Newest first; the backend
 * returns a flat array (no envelope).
 *
 * **Verified contract.** Response is a
 * flat `UsageEvent[]` (no pagination
 * envelope). The spec says the
 * `UsageEventListResponse` envelope lives
 * on the admin route (`GET /usage/events`)
 * which is owner/admin-only and has
 * cursor pagination; the per-tenant route
 * is a simple list with `limit` + `event_type`
 * filters.
 *
 * **Display rules (per the F7 Part 4 spec).**
 *   - DO display: `event_type`, `units`,
 *     `cost_usd`, `created_at`.
 *   - DO NOT display: `tenant_id` (the user is
 *     already in their tenant context).
 *   - `provider` + `model` are nice-to-have
 *     (e.g. for debugging a billing spike);
 *     the UI surfaces them in a small
 *     subtitle when present.
 *
 * **Auth + tenant scope.** Same as the
 * other usage endpoints — `me` is
 * intentional.
 */

import { apiConfig } from "@cortex/config"

import { getApiClient } from "@/lib/auth/api-client"

import type { UsageEvent } from "./types"

export interface GetTenantUsageEventsParams {
  /** Page size. Backend default 50, max 500. */
  limit?: number
  /** Optional event-type filter
   *  (`embedding` | `completion` | `rerank`
   *  | `storage` | `request`). */
  event_type?: string
  /** Optional abort signal (cancellation on unmount). */
  signal?: AbortSignal
}

export async function getTenantUsageEvents(
  params: GetTenantUsageEventsParams = {},
): Promise<ReadonlyArray<UsageEvent>> {
  const client = getApiClient()
  const { limit, event_type, signal } = params
  const query: Record<string, string | number> = {}
  if (limit !== undefined) query.limit = limit
  if (event_type !== undefined) query.event_type = event_type
  return client.get<ReadonlyArray<UsageEvent>>(
    apiConfig.paths.tenantUsageEvents,
    {
      ...(Object.keys(query).length > 0 ? { query } : {}),
      ...(signal ? { signal } : {}),
    },
  )
}
