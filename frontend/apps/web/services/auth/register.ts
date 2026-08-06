/**
 * Auth service — register.
 *
 * **F2 Part 1 (Task 5).** Wraps `POST /auth/register`.
 * Same conventions as the login service.
 *
 * **Backend contract.** The deployed `POST /auth/register`
 * (V4 single-step: "register tenant with owner") still
 * requires `tenant_name` + `tenant_slug` in the request
 * body. The F2 frontend spec separates user registration
 * from workspace creation, but until the backend is
 * redeployed with the new contract, we have to derive
 * the tenant identity client-side:
 *
 *   - `tenant_name` ← the user's `name` (so the
 *     auto-tenant reads as e.g. "Dev Narola")
 *   - `tenant_slug` ← the email's local-part +
 *     6-char UUID hex (guarantees uniqueness across
 *     concurrent registrations of users with the same
 *     email prefix)
 *
 * **Once the backend is redeployed** (the F2-aware
 * `RegisterRequest` makes tenant fields optional +
 * adds `POST /tenants`), the auto-derivation can be
 * dropped — the form will send only `{ name, email,
 * password }` and the user will go through the proper
 * workspace-setup flow.
 *
 * **Slug safety.** The backend enforces the slug
 * pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$`. The email's
 * local-part can contain `.` and `+` (Gmail-style),
 * so we sanitise: lowercase, then replace any
 * non-`[a-z0-9]` run with a single `-`, then trim
 * leading/trailing dashes. The result is appended with
 * a 6-char UUID hex to guarantee uniqueness.
 */

import type { AuthTenant } from "@/lib/auth/store"

import { getApiClient } from "@/lib/auth/api-client"

export interface RegisterResponse {
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

export interface RegisterRequest {
  name: string
  email: string
  password: string
  /**
   * Auto-derived from `name` when the backend requires
   * the V4 single-step tenant fields. F2-aware backends
   * ignore this (they accept the request without it).
   */
  tenant_name?: string
  /**
   * Auto-derived from `email` (sanitised) + a UUID
   * suffix. F2-aware backends ignore this.
   */
  tenant_slug?: string
}

function sanitizeSlugLocalPart(email: string): string {
  const local = email.split("@", 1)[0] ?? "user"
  // Lower-case + replace any non-`[a-z0-9]` run with
  // a single dash + trim leading/trailing dashes. This
  // matches the backend's slug regex.
  return local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "user"
}

function generateUuidHex(length: number): string {
  // 6 chars ≈ 16M possibilities — collision risk is
  // negligible for a single user signing up.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, length)
  }
  return Math.random().toString(16).slice(2, 2 + length).padEnd(length, "0")
}

/**
 * Derive the auto-tenant identity from the user's
 * name + email. Pure function so it's trivially
 * unit-testable.
 */
export function deriveTenantIdentity(
  name: string,
  email: string,
): { tenant_name: string; tenant_slug: string } {
  return {
    tenant_name: name,
    tenant_slug: `${sanitizeSlugLocalPart(email)}-${generateUuidHex(6)}`,
  }
}

export async function register(input: RegisterRequest): Promise<RegisterResponse> {
  const client = getApiClient()
  // Derive the V4 tenant fields from the user's name +
  // email when the caller didn't supply them. The
  // F2-aware backend ignores these; the V4 backend
  // requires them.
  const derived = deriveTenantIdentity(input.name, input.email)
  const body = {
    name: input.name,
    email: input.email,
    password: input.password,
    tenant_name: input.tenant_name ?? derived.tenant_name,
    tenant_slug: input.tenant_slug ?? derived.tenant_slug,
  }
  const data = await client.post<RegisterResponse>("/api/v1/auth/register", body)
  return data
}
