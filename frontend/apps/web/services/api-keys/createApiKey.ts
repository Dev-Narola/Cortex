/**
 * Create an API key — `POST /api-keys`.
 *
 * **F7 Part 2 (Tasks 1, 13, 15).** The generate
 * mutation. The backend's `require_admin` guard
 * means only `owner` / `admin` can call this —
 * a non-admin caller gets a 403, not a UI-side
 * gate bypass.
 *
 * **Verified contract.** Confirmed against
 * `Cortex/src/identity/interface/rest/routes.py`:
 *   - `POST /api-keys` with `CreateApiKeyRequest`
 *     returns `ApiKeyCreatedResponse` (extends
 *     `ApiKeyResponse` with a one-time `raw_key`).
 *   - The `raw_key` is never returned by the
 *     list or delete endpoints.
 *   - The backend persists `key_hash`, never
 *     `raw_key` — the database design explicitly
 *     states the raw key is shown once at creation
 *     and is not stored again.
 *
 * **The one-time secret is the response, not a
 * separate fetch.** The frontend receives the
 * `raw_key` exactly once (this response) and must
 * not refetch / persist / log it.
 */

import { getApiClient } from "@/lib/auth/api-client"

import type { ApiKeyCreated, CreateApiKeyRequest } from "./types"

export interface CreateApiKeyParams extends CreateApiKeyRequest {
  /** Optional abort signal (cancellation on unmount / modal close). */
  signal?: AbortSignal
}

export async function createApiKey(params: CreateApiKeyParams): Promise<ApiKeyCreated> {
  const client = getApiClient()
  const { signal, scopes, ...rest } = params
  const body: Record<string, unknown> = { ...rest }
  if (scopes !== undefined) {
    // The backend expects a JSON array of strings.
    body.scopes = [...scopes]
  }
  return client.post<ApiKeyCreated>("/api/v1/api-keys", body, {
    ...(signal ? { signal } : {}),
  })
}
