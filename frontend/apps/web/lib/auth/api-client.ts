/**
 * `ApiClient` singleton — wires the `ApiClient` runtime to the
 * auth store.
 *
 * **F0 scope (Task 25).** This is the only place in the app that
 * constructs an `ApiClient`. Every screen gets the same instance
 * via `getApiClient()`, so they all share the same auth token
 * provider and the same 401-refresh behaviour.
 *
 * Responsibilities:
 *   - Inject the Bearer token from the auth store.
 *   - On 401, attempt a silent refresh against `/auth/refresh`.
 *     The refresh token lives in an httpOnly cookie set by the
 *     backend, so the browser sends it automatically with
 *     `credentials: "include"`.
 *   - On refresh success, update the store and retry the original
 *     request.
 *   - On refresh failure, call `logout()` and let the 401 surface
 *     to the caller (which usually redirects to /login).
 *
 * **Future work** (owned by F2, not done here):
 *   - Real refresh-token rotation.
 *   - Concurrent-request dedup (so 5 in-flight requests don't all
     trigger their own refresh).
 *   - A "log out all tabs" broadcast.
 */

"use client"

import { ApiClient } from "@cortex/api-client"
import { publicEnv } from "@cortex/config"

import { useAuthStore } from "./store"

let cached: ApiClient | null = null

export function getApiClient(): ApiClient {
  if (cached) return cached
  cached = new ApiClient({
    baseUrl: publicEnv.NEXT_PUBLIC_API_URL,
    getAccessToken: () => useAuthStore.getState().accessToken,
    onUnauthorized: async () => {
      try {
        const res = await fetch(`${publicEnv.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`, {
          method: "POST",
          credentials: "include",
        })
        if (!res.ok) {
          await useAuthStore.getState().logout()
          return false
        }
        const data = (await res.json()) as { access_token: string }
        // Only update the token; leave user/tenant/loading alone.
        useAuthStore.setState({ accessToken: data.access_token })
        return true
      } catch {
        await useAuthStore.getState().logout()
        return false
      }
    },
  })
  return cached
}

/**
 * Hard-reset for test suites and "log out everywhere" flows. The
 * cached client keeps its closure, but the next caller will pick
 * up the cleared auth state on the next read.
 */
export function resetApiClient(): void {
  cached = null
}
