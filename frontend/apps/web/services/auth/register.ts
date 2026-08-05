/**
 * Auth service — register.
 *
 * **F2 Part 1 (Task 5).** Wraps `POST /auth/register`.
 * Same conventions as the login service.
 *
 * **Known backend issue (logged).** As of the F2
 * kickoff, the deployed `POST /auth/register` returns
 * 500 because the backend's Redis dependency is down
 * on the EC2 host. The wire path + the schemas +
 * the inline duplicate-email handling all assume the
 * real backend; once Redis is back up the flow works
 * end-to-end without code changes.
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
}

export async function register(input: RegisterRequest): Promise<RegisterResponse> {
  const client = getApiClient()
  const data = await client.post<RegisterResponse>("/api/v1/auth/register", input)
  return data
}
