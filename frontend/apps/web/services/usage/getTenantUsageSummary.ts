/**
 * Get the tenant's flat usage summary —
 * `GET /tenants/me/usage/summary`.
 *
 * **F7 Part 4.** The dashboard card data
 * source. The spec says this is the shape
 * the "Usage & Billing" tab consumes.
 *
 * **Verified contract.** Response shape is
 * `UsageSummary` (defined in `./types`) —
 * mirrors the backend's `UsageSummaryResponse`
 * (verified against
 * `Cortex/src/billing/interface/rest/routes.py:67-98`).
 *
 * **Auth + tenant scope.** The endpoint is
 * `/tenants/me/usage/summary` — `me` is
 * intentional. The backend resolves the
 * tenant from the authenticated JWT and the
 * SQL aggregate is filtered by `tenant_id`.
 * The frontend never sends a `tenant_id`
 * query param.
 *
 * **Period query params.** Optional
 * `period_start` + `period_end`. When absent
 * the backend defaults to "the current
 * calendar month to now" (the UI's "Current
 * period" default).
 *
 * **Abort signal.** The hook layer cancels
 * an in-flight request on unmount.
 */

import { apiConfig } from "@cortex/config"

import { getApiClient } from "@/lib/auth/api-client"

import type { UsageSummary } from "./types"

export interface GetTenantUsageSummaryParams {
  /** Inclusive lower bound (UTC). ISO 8601.
   *  Optional — backend defaults to the start
   *  of the current calendar month. */
  period_start?: string
  /** Exclusive upper bound (UTC). ISO 8601.
   *  Optional — backend defaults to now. */
  period_end?: string
  /** Optional abort signal (cancellation on unmount). */
  signal?: AbortSignal
}

export async function getTenantUsageSummary(
  params: GetTenantUsageSummaryParams = {},
): Promise<UsageSummary> {
  const client = getApiClient()
  const { period_start, period_end, signal } = params
  const query: Record<string, string> = {}
  if (period_start !== undefined) query.period_start = period_start
  if (period_end !== undefined) query.period_end = period_end
  return client.get<UsageSummary>(apiConfig.paths.tenantUsageSummary, {
    ...(Object.keys(query).length > 0 ? { query } : {}),
    ...(signal ? { signal } : {}),
  })
}
