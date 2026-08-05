/**
 * (app) route group — auth-gated, client-heavy.
 *
 * **F0 scope (Task 16) + F2 Part 1 (Task 10).** This
 * layout defines theme + spacing + container +
 * navigation. F2 wires the auth gate:
 *   - `ProtectedRoute` checks the auth store and
 *     redirects unauthenticated users to
 *     `/login?next=...`.
 *   - `middleware.ts` is the first line of defence at
 *     the edge; ProtectedRoute is the second line for
 *     client-side navigations.
 *
 * **Theme is structural, not a preference.** The
 * dark palette is set as the default for the entire
 * (app) group via the `data-theme="dark"` attribute.
 *
 * **Future F1/F2 work:**
 *   - Sidebar / TopBar components (F1).
 *   - UserMenu / sign-out (F2 — `useSession`).
 *   - Role-based gates (F2+).
 */

import { ProtectedRoute } from "@/components/auth"
import { ThemeToggle } from "@/components/theme-toggle"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute>
      <div data-theme="dark" className="flex min-h-screen bg-background text-foreground">
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
    </ProtectedRoute>
  )
}
