/**
 * `useSessionRestore` — Silent session restoration hook.
 *
 * **F2 Part 3 (Task 21).**
 *
 * Responsibilities:
 *   - Runs once after the store rehydrates from sessionStorage.
 *   - Validates access token expiration.
 *   - If valid (expiresAt > now), marks restoration complete.
 *   - If expired or missing, attempts silent refresh via `refresh()` service.
 *   - On refresh success, updates tokens in `useAuthStore`.
 *   - On refresh failure, clears state via `logout()`.
 *   - Exposes `isRestoring` and `restored` flags to block page render until complete.
 */

"use client"

import { useEffect } from "react"

import { useAuthStore } from "@/lib/auth/store"
import { refresh } from "@/services/auth/refresh"

export function useSessionRestore() {
  const hydrated = useAuthStore((s) => s.hydrated)
  const restored = useAuthStore((s) => s.restored)
  const isRestoring = useAuthStore((s) => s.isRestoring)
  const accessToken = useAuthStore((s) => s.accessToken)
  const expiresAt = useAuthStore((s) => s.expiresAt)
  const setRestored = useAuthStore((s) => s.setRestored)
  const setIsRestoring = useAuthStore((s) => s.setIsRestoring)
  const updateTokens = useAuthStore((s) => s.refresh)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    if (!hydrated) return
    const currentStore = useAuthStore.getState()
    if (currentStore.restored || currentStore.isRestoring) return

    let isMounted = true

    async function restoreSession() {
      useAuthStore.setState({ isRestoring: true })

      const currentToken = useAuthStore.getState().accessToken
      const currentExpiresAt = useAuthStore.getState().expiresAt

      const hasValidToken =
        currentToken !== null && currentExpiresAt !== null && currentExpiresAt > Date.now()

      if (hasValidToken) {
        if (isMounted) {
          useAuthStore.setState({ isRestoring: false, restored: true })
        }
        return
      }

      // Token is expired or missing; attempt silent refresh
      try {
        const res = await refresh()
        if (isMounted) {
          if (res?.access_token) {
            useAuthStore.getState().refresh({
              accessToken: res.access_token,
              expiresIn: res.expires_in ?? 900,
            })
            useAuthStore.setState({ isRestoring: false, restored: true })
          } else {
            await useAuthStore.getState().logout()
            useAuthStore.setState({ isRestoring: false, restored: true })
          }
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
  }, [hydrated, accessToken, expiresAt])

  return {
    isRestoring,
    restored,
  }
}
