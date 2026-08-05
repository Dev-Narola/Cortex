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
 * **Why client-side + not just middleware.** The
 * middleware is the first line of defence (it
 * redirects at the edge before any HTML is sent);
 * ProtectedRoute is the second line for client-
 * navigations (Next.js client-side route changes
 * don't go through middleware). Both must agree.
 *
 * **No permission logic yet.** F2 Part 1 ships
 * auth-only gating; role-based access control
 * (viewer / member / admin / owner) is a later
 * F2 part.
 */

"use client"

import { useRouter } from "next/navigation"
import { type ReactNode, useEffect, useState } from "react"

import { Spinner } from "@cortex/ui"

import { useSessionRestore } from "@/hooks/auth/useSessionRestore"
import { useAuthStore } from "@/lib/auth/store"

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

export function ProtectedRoute({
  children,
  loginPath = "/login",
  redirectIfAuthenticatedTo,
  nextPath,
}: ProtectedRouteProps) {
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
    if (!mounted) return
    // Wait for store hydration AND silent session restore before deciding
    if (!hydrated || isRestoring) return

    if (!isAuthed) {
      const next = nextPath ?? `${window.location.pathname}${window.location.search}`
      const url = next ? `${loginPath}?next=${encodeURIComponent(next)}` : loginPath
      router.replace(url as never)
      return
    }
    if (redirectIfAuthenticatedTo) {
      router.replace(redirectIfAuthenticatedTo as never)
    }
  }, [hydrated, isRestoring, isAuthed, loginPath, redirectIfAuthenticatedTo, nextPath, mounted, router])

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
