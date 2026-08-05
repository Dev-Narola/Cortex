/**
 * Auth service — refresh.
 *
 * **F2 Part 1 (Task 5).** The refresh-token rotation
 * endpoint. The refresh token itself is stored in an
 * httpOnly cookie set by the backend on `/auth/login` +
 * `/auth/register`; this service sends it back to
 * `/auth/refresh` and gets a new access token.
 *
 * **Why a separate service file.** The api-client's
 * `onUnauthorized` already calls this path, but the
 * form-level "session expired" recovery flow also
 * needs a way to force a refresh. Keeping it as a
 * service makes both call-sites symmetric.
 */

import { getApiClient } from "@/lib/auth/api-client"

export interface RefreshResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export async function refresh(): Promise<RefreshResponse> {
  const client = getApiClient()
  const data = await client.post<RefreshResponse>("/api/v1/auth/refresh")
  return data
}
