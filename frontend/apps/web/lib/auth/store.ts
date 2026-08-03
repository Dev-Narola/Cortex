/**
 * Auth store — Zustand-backed.
 *
 * **F0 scope (Task 19).** The spec restricts the global client
 * state to cross-screen concerns. Auth is the only one of those
 * today, so this is the only Zustand store in the app.
 *
 * **State shape (per spec):**
 *   - `accessToken` — the JWT issued by `POST /auth/login`
 *   - `user`        — the logged-in user record
 *   - `tenant`      — the active tenant (the one the user logged
 *                     in under; users can belong to multiple
 *                     tenants, but only one is active per session)
 *   - `loading`     — true while a `login()` / `logout()` /
 *                     `refresh()` is in flight (so the UI can
 *                     show a spinner without re-deriving it)
 *
 * **Actions (per spec):**
 *   - `login()`  — accept a session payload, write it to state
 *   - `logout()` — clear state, tell the backend (best-effort)
 *   - `reset()`  — hard-clear (used by error recovery / 401 storm)
 *
 * **No API calls in the store.** The store is state-only; the
 * actual `POST /auth/login` lives in the login page (F2), the
 * refresh in `api-client.ts` (F0). The store is a thin shell
 * so the auth UI never has to know about fetch / refresh / cookies.
 *
 * **Persistence.** sessionStorage (cleared on tab close) so a
 * hard refresh doesn't bounce the user to /login. Never
 * localStorage — tokens are an XSS-prone surface.
 */

"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { apiConfig } from "@cortex/config"

export type AuthRole = "owner" | "admin" | "member" | "viewer"

export interface AuthUser {
  id: string
  email: string
  role: AuthRole
  tenantId: string
}

export interface AuthTenant {
  id: string
  slug: string
  name: string
}

export interface AuthSession {
  accessToken: string
  user: AuthUser
  tenant: AuthTenant
}

interface AuthState {
  accessToken: string | null
  user: AuthUser | null
  tenant: AuthTenant | null
  loading: boolean
  /** True after the store has rehydrated from sessionStorage. */
  hydrated: boolean

  login: (session: AuthSession) => void
  logout: () => Promise<void>
  reset: () => void
  setLoading: (loading: boolean) => void
  markHydrated: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      tenant: null,
      loading: false,
      hydrated: false,

      login: ({ accessToken, user, tenant }) => set({ accessToken, user, tenant, loading: false }),

      logout: async () => {
        // Clear local state first so the UI updates immediately;
        // tell the backend to invalidate the refresh-token cookie
        // in the background. Failures are silently swallowed — the
        // local logout still proceeds.
        set({ accessToken: null, user: null, tenant: null, loading: false })
        if (typeof window !== "undefined") {
          try {
            await fetch(`${apiConfig.baseUrl}/api/v1/auth/logout`, {
              method: "POST",
              credentials: "include",
            })
          } catch {
            // no-op
          }
        }
      },

      reset: () =>
        set({
          accessToken: null,
          user: null,
          tenant: null,
          loading: false,
        }),

      setLoading: (loading) => set({ loading }),

      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "cortex.auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        tenant: state.tenant,
      }),
      onRehydrateStorage: () => (state) => {
        // Mark hydrated on the next tick so subscribers can read it.
        if (state) state.markHydrated()
      },
    },
  ),
)
