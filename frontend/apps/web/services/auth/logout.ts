/**
 * Auth service — logout.
 *
 * **F2 Part 1 (Task 5).** Best-effort call to
 * `POST /auth/logout`. The auth store's `logout()`
 * action calls this; failures are silently swallowed
 * so the user is always logged out locally even when
 * the backend is unreachable.
 *
 * **No throw.** Every consumer calls this from a
 * `try/finally`-like context where a thrown error
 * would block the local clear. The auth store is the
 * source of truth for "is the user logged out", not
 * the backend.
 */

import { getApiClient } from "@/lib/auth/api-client"

export async function logout(): Promise<void> {
  try {
    const client = getApiClient()
    await client.post("/api/v1/auth/logout")
  } catch {
    // No-op: local logout still proceeds even if the
    // backend is down or the cookie has already expired.
  }
}
