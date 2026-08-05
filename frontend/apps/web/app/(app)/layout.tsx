/**
 * (app) route group — auth-gated, dark theme.
 *
 * **F0 + F2 Part 1 (Task 10) + F2 Part 2 (Tasks 17, 18, 20).**
 *
 * Responsibilities:
 *   1. **Auth gate** — `<ProtectedRoute>` redirects
 *      unauthenticated users to `/login?next=...`.
 *   2. **Tenant gate** — once the auth store hydrates, an
 *      effect redirects users without a tenant to
 *      `/workspace-setup`. The check is at the (app) layer
 *      so every (app) page inherits it; the dashboard
 *      itself can assume `tenant` is non-null.
 *   3. **Theme transition** — on mount, the effect also
 *      calls `setAnimatedTheme("dark")` (which uses
 *      `document.startViewTransition`) so the page
 *      morphs from the marketing (light) palette into the
 *      app (dark) palette. The transition is ~300ms; the
 *      layout remains mounted throughout (no flicker).
 *   4. **Chrome** — placeholder sidebar + topbar; F1 ships
 *      the real components.
 *
 * **No business logic.** Layout only.
 */

"use client"

import { useTheme } from "next-themes"
import { useEffect } from "react"

import { OnboardingGuard, ProtectedRoute } from "@/components/auth"
import { ThemeToggle } from "@/components/theme-toggle"
import { useViewTransitions } from "@/lib/theme/view-transitions"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { setTheme } = useTheme()
  const { setAnimatedTheme, isSupported } = useViewTransitions()

  useEffect(() => {
    if (isSupported) {
      setAnimatedTheme("dark")
    } else {
      setTheme("dark")
    }
  }, [isSupported, setAnimatedTheme, setTheme])

  return (
    <ProtectedRoute>
      <OnboardingGuard>
        <div
          data-theme="dark"
          className="flex min-h-screen bg-background text-foreground"
        >
          {/* Sidebar — placeholder until F1 ships the real component. */}
          <aside
            aria-label="Primary navigation"
            className="hidden w-60 shrink-0 border-r border-border bg-muted/30 md:flex md:flex-col"
          >
            <div className="flex h-14 items-center px-4">
              <span className="font-display text-lg font-semibold text-spark">Cortex</span>
            </div>
            <nav className="flex-1 px-2 py-4 text-sm text-muted-foreground">
              <p className="px-3 py-2 text-xs uppercase tracking-wider opacity-60">Navigation</p>
            </nav>
          </aside>

          {/* Main column */}
          <div className="flex flex-1 flex-col">
            <header className="flex h-14 items-center justify-end border-b border-border bg-background px-6">
              <ThemeToggle />
            </header>
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </div>
        </div>
      </OnboardingGuard>
    </ProtectedRoute>
  )
}
