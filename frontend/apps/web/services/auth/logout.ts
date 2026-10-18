/**
 * Auth service — logout.
 *
 * `revokeRefreshToken` tells the server (`POST /api/v1/auth/logout`) that the
 * refresh token may no longer mint sessions. The store's `logout()` clears the
 * UI first, then calls it in the background; access tokens are short-lived and
 * simply expire. Neither function throws.
 */

import { getApiClient, resetApiClient } from "@/lib/auth/api-client"
import { useAuthStore } from "@/lib/auth/store"

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  try {
    await getApiClient().post("/api/v1/auth/logout", { refresh_token: refreshToken })
  } catch {
    // Best effort: the user is already signed out locally.
  } finally {
    resetApiClient()
  }
}

/** Clear the local session and revoke its refresh token. */
export async function logout(): Promise<void> {
  const refreshToken = useAuthStore.getState().refreshToken
  useAuthStore.getState().clear()
  if (refreshToken) await revokeRefreshToken(refreshToken)
  else resetApiClient()
}
