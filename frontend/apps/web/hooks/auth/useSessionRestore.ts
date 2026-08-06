/**
 * `useSessionRestore` — Silent session restoration hook.
 *
 * **F2 Part 3 (Task 21).**
 *
 * Responsibilities:
 *   - Runs once after the store rehydrates from sessionStorage.
 *   - Validates access token expiration.
 *   - If valid (expiresAt > now), marks restoration complete.
 *   - If expired but refreshToken exists, attempts silent refresh
 *     via the `refresh` service. Bypasses the api-client's
 *     401 → refresh loop so the original call isn't retried
 *     through the same handler.
 *   - If no tokens at all (fresh visitor), skips the refresh and
 *     marks restoration complete immediately.
 *   - On refresh failure, clears state via `logout()`.
 *   - Exposes `isRestoring` and `restored` flags to block page render until complete.
 */

"use client"

import { useEffect } from "react"

import { refresh } from "@/services/auth/refresh"
import { useAuthStore } from "@/lib/auth/store"

export function useSessionRestore() {
  const hydrated = useAuthStore((s) => s.hydrated)
  const restored = useAuthStore((s) => s.restored)
  const isRestoring = useAuthStore((s) => s.isRestoring)

  useEffect(() => {
    if (!hydrated) return
    const store = useAuthStore.getState()
    if (store.restored || store.isRestoring) return

    let isMounted = true

    async function restoreSession() {
      useAuthStore.setState({ isRestoring: true })

      const { accessToken, refreshToken, expiresAt } = useAuthStore.getState()

      // Case 1: Valid, non-expired token → done.
      const hasValidToken =
        accessToken !== null && expiresAt !== null && expiresAt > Date.now()

      if (hasValidToken) {
        if (isMounted) useAuthStore.setState({ isRestoring: false, restored: true })
        return
      }

      // Case 2: No tokens at all → fresh visitor, skip refresh.
      if (!accessToken && !refreshToken) {
        if (isMounted) useAuthStore.setState({ isRestoring: false, restored: true })
        return
      }

      // Case 3: Expired or invalid token with a refresh token → try silent refresh.
      try {
        const data = await refresh()
        if (!isMounted) return

        if (data?.access_token) {
          useAuthStore.getState().refresh({
            accessToken: data.access_token,
            expiresIn: data.expires_in ?? 900,
          })
          useAuthStore.setState({ isRestoring: false, restored: true })
        } else {
          await useAuthStore.getState().logout()
          useAuthStore.setState({ isRestoring: false, restored: true })
        }
      } catch {
        if (isMounted) {
          await useAuthStore.getState().logout()
          useAuthStore.setState({ isRestoring: false, restored: true })
        }
      }
    }

    void restoreSession()

    return () => {
      isMounted = false
    }
    // Only depends on `hydrated`. The effect reads fresh store state
    // inside the async function, and uses the `restored` / `isRestoring`
    // guards to prevent re-running after the first attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  return {
    isRestoring,
    restored,
  }
}
