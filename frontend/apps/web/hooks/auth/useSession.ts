/**
 * useSession — read-only hook over the auth store.
 *
 * **F2 Part 1 (Task 8/9).** Returns the current
 * session, the hydration state, and a `logout` helper.
 * The `hydrated` flag tells callers whether the store
 * has finished rehydrating from sessionStorage —
 * `ProtectedRoute` uses this to wait before deciding
 * whether to redirect.
 *
 * **No polling / no refresh.** The api-client's
 * `onUnauthorized` handler drives the silent refresh
 * path; this hook is a thin read.
 */

"use client"

import { useCallback } from "react"

import { useAuthStore } from "@/lib/auth/store"

export function useSession() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const expiresAt = useAuthStore((s) => s.expiresAt)
  const hydrated = useAuthStore((s) => s.hydrated)
  const loading = useAuthStore((s) => s.loading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const logout = useAuthStore((s) => s.logout)
  const clear = useAuthStore((s) => s.clear)

  return {
    accessToken,
    user,
    tenant,
    expiresAt,
    hydrated,
    loading,
    isAuthenticated,
    logout: useCallback(() => logout(), [logout]),
    clear: useCallback(() => clear(), [clear]),
  }
}
