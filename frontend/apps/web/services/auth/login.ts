/**
 * Auth service — login.
 *
 * **F2 Part 1 (Task 5).** Thin wrapper over the shared
 * `ApiClient`. Never call `fetch` directly; always go
 * through this so the api-client's auth header injection
 * + 401-refresh path applies uniformly.
 *
 * **Response shape.** The backend's `POST /auth/login`
 * returns the JWT + refresh token + the user + the
 * default tenant. The service returns the raw
 * `LoginResponse`; the form / hook unwraps it and
 * hands the pieces to the auth store.
 *
 * **No state.** The service doesn't touch the auth
 * store — the caller does. Keeps the service unit-testable
 * + swappable.
 */

import type { AuthTenant } from "@/lib/auth/store"

import { getApiClient } from "@/lib/auth/api-client"

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: {
    id: string
    email: string
    role: "owner" | "admin" | "member" | "viewer"
    tenant_id: string
  }
  tenant: AuthTenant
}

export interface LoginRequest {
  tenant_slug: string
  email: string
  password: string
}

export async function login(input: LoginRequest): Promise<LoginResponse> {
  const client = getApiClient()
  const data = await client.post<LoginResponse>("/api/v1/auth/login", input)
  return data
}
