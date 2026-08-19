/**
 * Revoke an API key — `DELETE /api-keys/{id}`.
 *
 * **F7 Part 2 (Tasks 1, 25).** The revoke mutation.
 * The backend's `require_admin` guard means only
 * `owner` / `admin` can call this.
 *
 * **Verified contract.** Confirmed against
 * `Cortex/src/identity/interface/rest/routes.py`:
 *   - `DELETE /api-keys/{api_key_id}` returns the
 *     updated `ApiKeyResponse` (the revoked row,
 *     with `revoked_at` set).
 *   - The route is idempotent in the audit log
 *     (V4 Phase 30) — re-revoking a revoked key
 *     returns the same row without error. The
 *     frontend still hides the action for revoked
 *     keys (per spec Task 27) so the user doesn't
 *     see a no-op.
 *
 * **The id path-param is the UUID.** We use
 * `encodeURIComponent` on the id so UUIDs with
 * non-alphanumeric characters (none today, but
 * future-proof) survive transit.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { ApiKey } from "./types"

export interface RevokeApiKeyParams {
  id: string
  /** Optional abort signal (cancellation on unmount / modal close). */
  signal?: AbortSignal
}

export async function revokeApiKey(params: RevokeApiKeyParams): Promise<ApiKey> {
  const client = getApiClient()
  const { id, signal } = params
  return client.delete<ApiKey>(`/api/v1/api-keys/${encodeURIComponent(id)}`, {
    ...(signal ? { signal } : {}),
  })
}
