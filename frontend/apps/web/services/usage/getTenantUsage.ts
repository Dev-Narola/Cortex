/**
 * Get the tenant's usage aggregate —
 * `GET /tenants/me/usage`.
 *
 * **F7 Part 4.** The per-event-type
 * breakdown data source.
 *
 * **Verified contract.** Response shape is
 * `TenantUsageAggregate` (defined in
 * `./types`) — mirrors the backend's
 * `TenantUsageResponse` (verified against
 * `Cortex/src/billing/interface/rest/routes.py:59-65`).
 *
 * The `by_event` map shape mirrors the SQL
 * `GROUP BY (event_type, unit_type)` produced
 * by `aggregate_for_tenant` in
 * `Cortex/src/billing/infrastructure/repositories.py:151-200`:
 *
 *   {
 *     "embedding":  { "tokens": 12345.0, "cost_usd": 0.024 },
 *     "completion": { "tokens": 9876.0,  "cost_usd": 0.118 },
 *     "rerank":     { "candidates": 4600.0, "cost_usd": 0.018 },
 *     ...
 *   }
 *
 * **The breakdown is dense.** Each event
 * type carries its own `cost_usd` roll-up
 * (the backend puts a `cost_usd` row in
 * every event-type bucket). The top-level
 * `total_cost_usd` is the sum across all
 * buckets.
 *
 * **Auth + tenant scope.** Same as the
 * summary endpoint — `me` is intentional.
 */

import { apiConfig } from "@cortex/config"

import { getApiClient } from "@/lib/auth/api-client"

import type { TenantUsageAggregate } from "./types"

export interface GetTenantUsageParams {
  period_start?: string
  period_end?: string
  /** Optional abort signal (cancellation on unmount). */
  signal?: AbortSignal
}

export async function getTenantUsage(
  params: GetTenantUsageParams = {},
): Promise<TenantUsageAggregate> {
  const client = getApiClient()
  const { period_start, period_end, signal } = params
  const query: Record<string, string> = {}
  if (period_start !== undefined) query.period_start = period_start
  if (period_end !== undefined) query.period_end = period_end
  return client.get<TenantUsageAggregate>(apiConfig.paths.tenantUsage, {
    ...(Object.keys(query).length > 0 ? { query } : {}),
    ...(signal ? { signal } : {}),
  })
}
