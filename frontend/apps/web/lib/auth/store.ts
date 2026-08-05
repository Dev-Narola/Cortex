/**
 * Auth store — Zustand-backed, sessionStorage-persisted.
 *
 * **F2 Part 1 (Task 8).** State-only auth store. The actual
 * HTTP calls live in `services/auth/`; the store is the
 * source of truth for "who is the current user + tenant
 * + tokens" and nothing else.
 *
 * **State shape (per spec).**
 *   - `accessToken`   — the short-lived JWT.
 *   - `refreshToken`  — the longer-lived rotation token.
 *     (Currently used by the api-client's silent-refresh
 *     path; the form / hook can read it for the "session
 *     expired" UX.)
 *   - `user`          — the logged-in user record.
 *   - `tenant`        — the active tenant.
 *   - `expiresAt`     — epoch ms when the access token
 *     expires. The api-client reads this to skip the
 *     network round-trip when it knows the token is
 *     already expired.
 *   - `isAuthenticated` — derived boolean (computed from
 *     `accessToken != null` + `expiresAt > now`).
 *
 * **Actions (per spec).**
 *   - `login()`   — accept a session payload, write it.
 *   - `logout()`  — clear state, best-effort backend call.
 *   - `refresh()` — replace the access token (and the
 *                   expiresAt) with a fresh one. Used by
 *                   the silent-refresh path.
 *   - `restore()` — rehydrate the store from the persisted
 *                   blob. Called once on app startup. The
 *                   Zustand `persist` middleware handles
 *                   this automatically; the explicit action
 *                   is for cases where the consumer wants
 *                   to wait for hydration (e.g. the
 *                   ProtectedRoute).
 *   - `clear()`   — hard-clear (used by 401 storms / error
 *                   recovery).
 *
 * **Persistence.** sessionStorage (cleared on tab close)
 * so a hard refresh doesn't bounce the user to /login.
 * Never localStorage — tokens are an XSS-prone surface.
 * The `partialize` whitelist keeps `loading` and
 * `isAuthenticated` out of the persisted blob (they
 * are derived on every read).
 */

"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export const AUTH_HINT_COOKIE = "cortex_auth_hint"

/**
 * Sync the auth-hint cookie with the store. The middleware
 * reads this cookie to know whether the user has a
 * session — the access token itself is in sessionStorage
 * (invisible to the edge), so we mirror the presence as
 * a cookie the edge can read.
 *
 * **Not a security boundary.** A malicious client could
 * set the cookie to "1" and bypass the edge redirect,
 * but the client-side `ProtectedRoute` is the source of
 * truth — the cookie is just a hint to skip rendering
 * the protected layout when the user is clearly
 * unauthenticated.
 */
function setAuthHintCookie(value: "1" | "0"): void {
  if (typeof document === "undefined") return
  // 1-day max-age; the access token is short-lived and
  // the real source of truth is the JWT itself.
  const oneDay = 60 * 60 * 24
  document.cookie = `${AUTH_HINT_COOKIE}=${value}; Path=/; Max-Age=${oneDay}; SameSite=Lax`
}

function clearAuthHintCookie(): void {
  if (typeof document === "undefined") return
  document.cookie = `${AUTH_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}

export type AuthRole = "owner" | "admin" | "member" | "viewer"

/**
 * The "current tenant" record. After onboarding,
 * the auth store carries the active workspace here.
 * `slug` is the URL-friendly handle (e.g. "acme");
 * `workspace` is the friendly display name (e.g. "Acme");
 * `organization` is the umbrella entity the workspace
 * belongs to (multi-tenant organisations land in F3+).
 */
export interface AuthTenant {
  id: string
  slug: string
  /** Friendly display name; falls back to `slug` if absent. */
  workspace?: string
  /** Umbrella entity the tenant belongs to. */
  organization?: string
}

export interface AuthUser {
  id: string
  email: string
  role: AuthRole
  tenantId: string
}

/**
 * The payload handed to `login()`. Captures everything
 * the backend returned that we need to bootstrap a
 * session.
 */
export interface AuthSession {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: AuthUser
  tenant: AuthTenant
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
  tenant: AuthTenant | null
  /** True once the user has completed workspace onboarding. */
  isOnboarded: boolean
  /** Epoch ms when the access token expires. */
  expiresAt: number | null
  loading: boolean
  /** True after the store has rehydrated from sessionStorage. */
  hydrated: boolean
  /** True once silent session restoration has completed. */
  restored: boolean
  /** True while silent session restoration is in flight. */
  isRestoring: boolean

  // -- Computed selectors (not stored) --
  isAuthenticated: () => boolean
  hasTenant: () => boolean

  // -- Actions --
  login: (session: AuthSession) => void
  logout: () => Promise<void>
  refresh: (input: { accessToken: string; expiresIn: number }) => void
  restore: () => void
  clear: () => void

  // -- Restoration state helpers --
  setRestored: (restored: boolean) => void
  setIsRestoring: (isRestoring: boolean) => void

  // -- Onboarding actions (F2 Part 2) --
  setTenant: (tenant: AuthTenant) => void
  completeOnboarding: () => void
  clearTenant: () => void

  // -- Loading-state helper (not in spec, but the form uses it) --
  setLoading: (loading: boolean) => void
  markHydrated: () => void
}

/**
 * Compute the epoch ms when a token with `expiresIn`
 * seconds will expire. Clamps to a 0 minimum.
 */
function computeExpiresAt(expiresIn: number): number {
  return Date.now() + Math.max(0, expiresIn) * 1000
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      tenant: null,
      isOnboarded: false,
      expiresAt: null,
      loading: false,
      hydrated: false,
      restored: false,
      isRestoring: false,

      isAuthenticated: () => {
        const { accessToken, expiresAt } = get()
        if (!accessToken) return false
        if (expiresAt !== null && expiresAt <= Date.now()) return false
        return true
      },

      hasTenant: () => {
        return get().tenant !== null
      },

      login: (session) => {
        setAuthHintCookie("1")
        set({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          user: session.user,
          tenant: session.tenant ?? null,
          // If the backend returned a tenant at login time
          // (e.g. the user already belongs to a workspace
          // and is signing back in), mark them as onboarded.
          isOnboarded: session.tenant !== undefined,
          expiresAt: computeExpiresAt(session.expiresIn),
          loading: false,
          restored: true,
          isRestoring: false,
        })
      },

      logout: async () => {
        // Clear local state immediately so the UI updates;
        // tell the backend in the background. Best-effort.
        clearAuthHintCookie()
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          tenant: null,
          isOnboarded: false,
          expiresAt: null,
          loading: false,
          restored: true,
          isRestoring: false,
        })
        if (typeof window !== "undefined") {
          try {
            const { logout } = await import("@/services/auth")
            await logout()
          } catch {
            // No-op: local logout already cleared the UI state.
          }
        }
      },

      refresh: ({ accessToken, expiresIn }) => {
        setAuthHintCookie("1")
        set({
          accessToken,
          expiresAt: computeExpiresAt(expiresIn),
        })
      },

      restore: () => {
        // The Zustand persist middleware rehydrates the
        // persisted state automatically; this action is
        // a no-op today but kept for the API contract
        // (callers can `await useAuthStore.persist.rehydrate()`
        // for the actual rehydration).
        // Mirror the cookie so the middleware agrees.
        const { accessToken } = get()
        setAuthHintCookie(accessToken ? "1" : "0")
        set({ hydrated: true })
      },

      clear: () => {
        clearAuthHintCookie()
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          tenant: null,
          isOnboarded: false,
          expiresAt: null,
          loading: false,
          restored: false,
          isRestoring: false,
        })
      },

      setRestored: (restored) => set({ restored }),
      setIsRestoring: (isRestoring) => set({ isRestoring }),

      // -- Onboarding actions --

      setTenant: (tenant) => {
        set({ tenant })
      },

      completeOnboarding: () => {
        set({ isOnboarded: true })
      },

      clearTenant: () => {
        set({ tenant: null, isOnboarded: false })
      },

      setLoading: (loading) => set({ loading }),

      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "cortex.auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        tenant: state.tenant,
        isOnboarded: state.isOnboarded,
        expiresAt: state.expiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.markHydrated()
      },
    },
  ),
)
