/**
 * ProtectedRoute — the client-side auth gate.
 *
 * **F2 Part 1 (Task 10).** Wraps the (app) layout.
 * While the auth store is rehydrating from
 * sessionStorage, renders a loading shell. Once
 * hydrated, redirects unauthenticated users to
 * `/login?next=...`; authenticated users see the
 * children.
 *
 * **Two modes of operation:**
 *   1. **Protection mode** (default) — `redirectIfAuthenticatedTo`
 *      is not set. Requires authentication. Runs session
 *      restore, shows loading while restoring, redirects to
 *      login when unauthenticated.
 *   2. **Public auth page mode** — `redirectIfAuthenticatedTo`
 *      is set (e.g. on `/login`). Renders children immediately
 *      once hydrated. Only redirects if the user IS authenticated
 *      (so they don't see the login form when already signed in).
 *      Does NOT run session restore — no reason to attempt a
 *      network refresh on a page that doesn't require auth.
 *
 * **Why client-side + not just middleware.** The
 * middleware is the first line of defence (it
 * redirects at the edge before any HTML is sent);
 * ProtectedRoute is the second line for client-
 * navigations (Next.js client-side route changes
 * don't go through middleware). Both must agree.
 */

"use client"

import { useRouter } from "next/navigation"
import { type ReactNode, useEffect, useState } from "react"

import { Spinner } from "@cortex/ui"

import { useSessionRestore } from "@/hooks/auth/useSessionRestore"
import { AUTH_HINT_COOKIE, useAuthStore } from "@/lib/auth/store"

export interface ProtectedRouteProps {
  children: ReactNode
  /** Path to redirect to when unauthenticated. Default `/login`. */
  loginPath?: string
  /** Path to redirect to when authenticated. Default `null` (render children). */
  redirectIfAuthenticatedTo?: string
  /**
   * Path the user was trying to reach. Passed as
   * `?next=...` to the login page so they land back
   * here after signing in. Default: the current
   * `window.location.pathname + search`.
   */
  nextPath?: string
}

/**
 * Public-auth-page mode: renders children immediately,
 * redirects away only if already authenticated.
 */
function PublicAuthGate({
  children,
  redirectTo,
}: {
  children: ReactNode
  redirectTo: string
}) {
  const router = useRouter()
  const hydrated = useAuthStore((s) => s.hydrated)
  const isAuthed = useAuthStore((s) => s.isAuthenticated())
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !hydrated) return
    if (isAuthed) {
      router.replace(redirectTo as never)
    }
  }, [mounted, hydrated, isAuthed, redirectTo, router])

  // Show a brief loading state only during hydration
  if (!mounted || !hydrated) {
    return (
      <output
        className="flex min-h-screen items-center justify-center bg-background"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Spinner size="lg" />
        </div>
      </output>
    )
  }

  // Already authenticated → show spinner while redirect fires
  if (isAuthed) {
    return (
      <output
        className="flex min-h-screen items-center justify-center bg-background"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Spinner size="lg" />
          <p className="text-sm">Redirecting to dashboard…</p>
        </div>
      </output>
    )
  }

  return <>{children}</>
}

/**
 * Protection mode: requires authentication, runs
 * session restore, redirects to login when unauthenticated.
 */
function AuthRequiredGate({
  children,
  loginPath,
  nextPath,
}: {
  children: ReactNode
  loginPath: string
  nextPath?: string
}) {
  const router = useRouter()
  const hydrated = useAuthStore((s) => s.hydrated)
  const isAuthed = useAuthStore((s) => s.isAuthenticated())
  const restored = useAuthStore((s) => s.restored)
  const [mounted, setMounted] = useState(false)

  const { isRestoring } = useSessionRestore()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !hydrated || isRestoring) return

    if (!isAuthed) {
      // **V11 hotfix.** The edge middleware reads the
      // ``cortex_auth_hint`` cookie to decide whether
      // the user has a session. If the cookie is set
      // (e.g. from a previous browser session that
      // expired) but the auth store has no tokens,
      // the middleware keeps redirecting /login →
      // /app in a loop and the user is stuck on the
      // loading screen forever. Clear the cookie here
      // so the next navigation to /login passes the
      // edge check.
      if (
        typeof document !== "undefined" &&
        document.cookie.includes(`${AUTH_HINT_COOKIE}=1`)
      ) {
        document.cookie = `${AUTH_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
      }
      const currentPath = `${window.location.pathname}${window.location.search}`
      if (
        window.location.pathname === loginPath ||
        window.location.pathname.startsWith(`${loginPath}/`)
      ) {
        return
      }
      const targetNext = nextPath ?? currentPath
      const isValidNext = targetNext && !targetNext.startsWith(loginPath)
      const url = isValidNext ? `${loginPath}?next=${encodeURIComponent(targetNext)}` : loginPath
      router.replace(url as never)
    }
  }, [hydrated, isRestoring, isAuthed, loginPath, nextPath, mounted, router])

  if (!mounted || !hydrated || isRestoring || (!restored && !isAuthed)) {
    return (
      <output
        className="flex min-h-screen items-center justify-center bg-background"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Spinner size="lg" />
          <p className="text-sm">Restoring your session…</p>
        </div>
      </output>
    )
  }

  if (!isAuthed) {
    return (
      <output
        className="flex min-h-screen items-center justify-center bg-background"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Spinner size="lg" />
          <p className="text-sm">Redirecting to sign in…</p>
        </div>
      </output>
    )
  }

  return <>{children}</>
}

export function ProtectedRoute({
  children,
  loginPath = "/login",
  redirectIfAuthenticatedTo,
  nextPath,
}: ProtectedRouteProps) {
  if (redirectIfAuthenticatedTo) {
    return (
      <PublicAuthGate redirectTo={redirectIfAuthenticatedTo}>
        {children}
      </PublicAuthGate>
    )
  }

  return (
    <AuthRequiredGate loginPath={loginPath} nextPath={nextPath}>
      {children}
    </AuthRequiredGate>
  )
}

