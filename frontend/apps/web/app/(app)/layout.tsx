/**
 * (app) route group — auth-gated, client-heavy.
 *
 * **F0 scope (Task 16).** This layout defines theme + spacing +
 * container + navigation placeholder. It does NOT enforce auth
 * (that's middleware + the auth store, both owned by F2) and it
 * does NOT contain page logic.
 *
 * **Theme is structural, not a preference.** The `dark` class on
 * `<html>` is set by `next-themes` based on the system preference
 * plus the user toggle; this layout forces the dark palette for
 * the entire (app) group via the `data-theme="dark"` attribute,
 * which `tokens.css` keys off the `.dark` class for.
 *
 * **Future F1/F2 work** (placeholders only here, never wired):
 *   - Sidebar component (F1)
 *   - TopBar component (F1)
 *   - Auth-guard wrapper (F2 — middleware owns the check)
 *   - User menu / sign-out (F2)
 */
import { ThemeToggle } from "@/components/theme-toggle"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
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
          {/* F1: replace with <SidebarLink href="/app">Dashboard</SidebarLink> etc. */}
          <p className="px-3 py-2 text-xs uppercase tracking-wider opacity-60">Navigation</p>
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col">
        {/* Top bar — placeholder until F1 ships the real TopBar. */}
        <header className="flex h-14 items-center justify-end border-b border-border bg-background px-6">
          {/* F2: replace with <UserMenu /> */}
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
