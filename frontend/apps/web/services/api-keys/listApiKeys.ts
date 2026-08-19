/**
 * List API keys — `GET /api-keys`.
 *
 * **F7 Part 2 (Task 1).** The panel's data source.
 * The backend's `require_member` guard means every
 * authenticated tenant member can list — the panel
 * shows the list to every role; only the mutation
 * actions are RBAC-gated.
 *
 * **Verified contract.** Confirmed against
 * `Cortex/src/identity/interface/rest/routes.py`:
 *   - `GET /api-keys?include_revoked={bool}` returns
 *     `list[ApiKeyResponse]`.
 *   - `ApiKeyResponse` deliberately omits `key_hash`.
 *   - Default `include_revoked=false` (the spec's
 *     "Active keys" view). The panel exposes the
 *     `include_revoked` knob through the hook so
 *     future "show revoked" toggles are a one-liner.
 *
 * **Auth + tenant scope.** Inherited from
 * `getApiClient()` — the JWT is injected, the 401
 * silent-refresh path runs, and the backend's
 * `require_member` guard + `ApiKeyRepository.list`
 * (which is `tenant_id`-scoped) enforce the
 * isolation at the SQL level. The frontend never
 * passes a `tenant_id` query param.
 *
 * **Abort signal.** The hook layer cancels an
 * in-flight request on unmount (no "state update
 * on unmounted component" warnings).
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { ApiKeyList } from "./types"

export interface ListApiKeysParams {
  /**
   * Whether to include revoked keys in the
   * response. The backend defaults to `false`.
   * The panel passes `false` (the Active view).
   */
  include_revoked?: boolean
  /** Optional abort signal (cancellation on unmount). */
  signal?: AbortSignal
}

export async function listApiKeys(params: ListApiKeysParams = {}): Promise<ApiKeyList> {
  const client = getApiClient()
  const { include_revoked, signal } = params
  const query: Record<string, boolean> = {}
  if (include_revoked !== undefined) query.include_revoked = include_revoked
  return client.get<ApiKeyList>("/api/v1/api-keys", {
    ...(Object.keys(query).length > 0 ? { query } : {}),
    ...(signal ? { signal } : {}),
  })
}
