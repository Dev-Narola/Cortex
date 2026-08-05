/**
 * Tenant service — create a new workspace.
 *
 * **F2 Part 2 (Task 15).** Wraps `POST /tenants`. The
 * authenticated `ApiClient` is used (the request inherits
 * the Bearer token + the 401-refresh path from F0), so
 * an unauthenticated / expired request surfaces as a
 * 401 immediately.
 *
 * **No state.** Returns the parsed `Tenant`; the caller
 * hands it to the auth store.
 *
 * **Errors.**
 *   - 409 Conflict — slug already taken (inline on the
 *     slug field by the form).
 *   - 422 Validation — backend rejected the payload.
 *   - 401 Unauthorized — session expired; the api-client
 *     refresh path tries to recover first.
 *   - 5xx — server error; banner.
 *   - Network — `toFrontendError` maps to a network
 *     error message.
 */

import type { AuthTenant } from "@/lib/auth/store"

import { getApiClient } from "@/lib/auth/api-client"

export interface CreateTenantRequest {
  name: string
  slug: string
}

export interface Tenant extends AuthTenant {
  name: string
  organization?: string
}

export async function createTenant(
  input: CreateTenantRequest,
): Promise<Tenant> {
  const client = getApiClient()
  const data = await client.post<Tenant>("/api/v1/tenants", input)
  return data
}
