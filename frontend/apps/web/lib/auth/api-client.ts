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

import { rateLimitStore } from "@/hooks/system/rateLimitStore"

import { useAuthStore } from "./store"

let cached: ApiClient | null = null
let refreshPromise: Promise<boolean> | null = null

async function performRefresh(): Promise<boolean> {
  try {
    // **V11 hotfix.** The backend's ``POST /api/v1/auth/refresh``
    // expects a JSON body with the refresh token:
    //   { refresh_token: str }   (min_length=10)
    // The previous version of this function sent an
    // empty body, which the backend rejected with 422.
    // The api-client's silent-refresh path then called
    // ``logout()`` and the user was bounced to
    // ``/login`` on every hard refresh. The refresh
    // token lives in the Zustand auth store (not an
    // httpOnly cookie — the backend has no cookie
    // path today), so we read it from the store and
    // send it in the body.
    const refreshToken = useAuthStore.getState().refreshToken
    if (!refreshToken) {
      await useAuthStore.getState().logout()
      return false
    }
    const res = await fetch(
      `${publicEnv.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    )
    if (!res.ok) {
      await useAuthStore.getState().logout()
      return false
    }
    const data = (await res.json()) as { access_token: string; expires_in?: number }
    useAuthStore.getState().refresh({
      accessToken: data.access_token,
      expiresIn: data.expires_in ?? 900,
    })
    return true
  } catch {
    await useAuthStore.getState().logout()
    return false
  }
}

export function getApiClient(): ApiClient {
  if (cached) return cached
  cached = new ApiClient({
    baseUrl: publicEnv.NEXT_PUBLIC_API_URL,
    getAccessToken: () => useAuthStore.getState().accessToken,
    onUnauthorized: async () => {
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null
        })
      }
      return refreshPromise
    },
    onRateLimited: ({ retryAfterMs, message }) => {
      // F4 Part 4 (Task 97): surface 429s via the
      // shared rate-limit banner. The banner lives
      // at the (app) layout level so every
      // authenticated screen sees the same
      // message.
      rateLimitStore.set({ retryAfterMs, message: message ?? undefined })
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
