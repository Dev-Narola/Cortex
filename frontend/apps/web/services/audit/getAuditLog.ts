/**
 * Get the tenant's audit log —
 * `GET /api/v1/audit-log`.
 *
 * **F7 Part 5.** The Settings → Audit Log
 * page's data source. Owner/admin only; the
 * backend returns 403 for member/viewer
 * (verified against
 * `Cortex/src/observability/interface/rest/audit_routes.py:140-148`).
 *
 * **Verified contract.** Response shape is
 * `AuditEventListResponse` (defined in
 * `./types`) — mirrors the backend's
 * `AuditEventListResponse` (verified against
 * `Cortex/src/observability/interface/rest/audit_routes.py:59-61`).
 *
 * **Keyset pagination.** The backend uses
 * an opaque base64 cursor over
 * `(created_at desc, id desc)`. The frontend
 * is a *pass-through* — it never inspects
 * the cursor, just sends the previous page's
 * `next_cursor` back as the `cursor` query
 * param.
 *
 * **No full-history fetch.** The `limit`
 * query param is bounded server-side at
 * 1 ≤ limit ≤ 500 (default 50). The
 * Settings page caps at 50 per the
 * per-page convention; admin tooling
 * elsewhere can request up to 500.
 *
 * **Filter parameters.** Five server-side
 * filters are supported (all optional):
 *   - `actor_user_id`   (UUID)
 *   - `action`          (audit action enum)
 *   - `resource_type`   (resource-type enum)
 *   - `start_date`      (ISO 8601)
 *   - `end_date`        (ISO 8601)
 *
 * **Auth + tenant scope.** The route is
 * tenant-scoped — the backend resolves the
 * tenant from the authenticated JWT, never
 * from a query parameter. The frontend
 * never sends a `tenant_id` query param.
 *
 * **Abort signal.** The hook layer cancels
 * an in-flight request on unmount.
 */

import { apiConfig } from "@cortex/config"

import { getApiClient } from "@/lib/auth/api-client"

import type { AuditEventListResponse } from "./types"

export interface GetAuditLogParams {
  /** Server-side cursor (opaque base64).
   *  The frontend is a pass-through — pass
   *  the previous page's `next_cursor` back
   *  unchanged. */
  cursor?: string
  /** Page size. Backend default 50, max 500. */
  limit?: number
  /** Optional action filter (e.g.
   *  "document_accessed"). */
  action?: string
  /** Optional resource-type filter (e.g.
   *  "document"). */
  resource_type?: string
  /** Optional actor user-id filter (UUID). */
  actor_user_id?: string
  /** Optional inclusive lower bound for
   *  `created_at` (ISO 8601). */
  start_date?: string
  /** Optional exclusive upper bound for
   *  `created_at` (ISO 8601). */
  end_date?: string
  /** Optional abort signal (cancellation on unmount). */
  signal?: AbortSignal
}

export async function getAuditLog(
  params: GetAuditLogParams = {},
): Promise<AuditEventListResponse> {
  const client = getApiClient()
  const {
    cursor,
    limit,
    action,
    resource_type,
    actor_user_id,
    start_date,
    end_date,
    signal,
  } = params
  const query: Record<string, string | number> = {}
  if (cursor !== undefined) query.cursor = cursor
  if (limit !== undefined) query.limit = limit
  if (action !== undefined) query.action = action
  if (resource_type !== undefined) query.resource_type = resource_type
  if (actor_user_id !== undefined) query.actor_user_id = actor_user_id
  if (start_date !== undefined) query.start_date = start_date
  if (end_date !== undefined) query.end_date = end_date
  return client.get<AuditEventListResponse>(apiConfig.paths.auditLog, {
    ...(Object.keys(query).length > 0 ? { query } : {}),
    ...(signal ? { signal } : {}),
  })
}
