/**
 * Auth service — refresh.
 *
 * **F2 Part 1 (Task 5) + V11 hotfix.** The refresh-token
 * rotation endpoint. The backend's
 * ``POST /api/v1/auth/refresh`` expects a JSON body with
 * the refresh token (``{ refresh_token: str }``); this
 * service reads the token from the auth store and sends
 * it. Without the body the backend returns 422, the
 * ``useSessionRestore`` hook treats that as a refresh
 * failure, and the user gets bounced to ``/login`` on
 * every hard refresh.
 *
 * **Why a separate service file.** The api-client's
 * ``onUnauthorized`` already has its own silent-refresh
 * path (see ``lib/auth/api-client.ts``), but the
 * ``useSessionRestore`` hook + the form-level "session
 * expired" recovery flow also need a way to force a
 * refresh. Keeping it as a service makes every call-site
 * symmetric — they all go through this function.
 */

import { getApiClient } from "@/lib/auth/api-client"
import { useAuthStore } from "@/lib/auth/store"

export interface RefreshResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export async function refresh(): Promise<RefreshResponse> {
  // Read the refresh token from the auth store. The
  // refresh token is the one the backend issued at
  // login / register; the access token is the
  // short-lived JWT we just need to renew.
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) {
    throw new Error("No refresh token available")
  }
  const client = getApiClient()
  const data = await client.post<RefreshResponse>(
    "/api/v1/auth/refresh",
    { refresh_token: refreshToken },
  )
  return data
}
