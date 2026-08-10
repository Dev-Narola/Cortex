/**
 * (app) route group — auth-gated, dark workspace shell.
 *
 * **F3 Part 1 (Task 1).** The permanent authenticated
 * application shell. Every screen under `(app)` —
 * `/app/dashboard`, `/app/documents`, `/app/settings`,
 * future `/app/agents`, etc. — inherits this layout.
 *
 * **Composition.**
 *   1. `<ProtectedRoute>` — auth gate. Unauthenticated
 *      users are bounced to `/login?next=...`.
 *   2. `<OnboardingGuard>` — tenant gate. Users without
 *      a tenant go through `/workspace-setup` first.
 *   3. `<BreadcrumbProvider>` — context for per-page
 *      breadcrumb overrides (Task 6).
 *   4. `<ThemeApplier>` — sets next-themes to `dark` on
 *      mount. The (app) shell is always dark; the
 *      marketing shell forces light. The light→dark
 *      morph fires once on the first mount.
 *   5. `<AppShell>` — the actual UI: sidebar + main
 *      column (topbar + breadcrumb + page content).
 *
 * **No business logic.** Layout only. Pages should
 * never recreate navigation; everything is shared.
 *
 * **State persistence.** The sidebar's expanded/collapsed
 * preference lives in localStorage; the mobile drawer
 * is purely viewport-driven.
 */

"use client"

import { useTheme } from "next-themes"
import { useEffect, useState, type ReactNode } from "react"

import { OnboardingGuard, ProtectedRoute } from "@/components/auth"
import { DocumentDetailHost } from "@/components/documents/DocumentDetailHost"
import { RateLimitBanner } from "@/components/feedback/RateLimitBanner"
import { AppSidebar, type AppSidebarState } from "@/components/navigation/AppSidebar"
import { BreadcrumbProvider } from "@/components/navigation/BreadcrumbProvider"
import { Topbar } from "@/components/navigation/Topbar"
import { UserMenu } from "@/components/navigation/UserMenu"
import { useViewTransitions } from "@/lib/theme/view-transitions"

import { cn } from "@cortex/ui"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <OnboardingGuard>
        <BreadcrumbProvider>
          <ThemeApplier>
            <AppShell>
              {children}
              {/* DocumentDetailHost is the (app) layout's
                  single mount point for the F3 document
                  drawer. F4 Part 3 promoted it from the
                  documents page to here so the chat
                  citation panel can open the same drawer
                  via the global document-selection store. */}
              <DocumentDetailHost />
            </AppShell>
          </ThemeApplier>
        </BreadcrumbProvider>
      </OnboardingGuard>
    </ProtectedRoute>
  )
}

function ThemeApplier({ children }: { children: ReactNode }) {
  const { setTheme, resolvedTheme } = useTheme()
  const { setAnimatedTheme, isSupported } = useViewTransitions()
  // (F2 Part 2, Task 18) — the (app) shell is
  // always dark; the marketing shell is always
  // light. We ONLY set the theme on the first
  // mount when `resolvedTheme` is undefined
  // (the provider hasn't restored a choice yet).
  //
  // The previous version ran on every mount and
  // forced dark, which clobbered the user's
  // light-mode toggle (they'd flip to light,
  // navigate, and the layout snapped back to
  // dark). Honouring an existing resolved theme
  // is the right behaviour for a settings-
  // persistent toggle.
  useEffect(() => {
    if (resolvedTheme) return
    if (isSupported) {
      setAnimatedTheme("dark")
    } else {
      setTheme("dark")
    }
  }, [resolvedTheme, isSupported, setAnimatedTheme, setTheme])
  return <>{children}</>
}

function AppShell({ children }: { children: ReactNode }) {
  // `viewport` here is the user-controlled desktop
  // state (expanded | collapsed) vs the mobile drawer.
  // Default expanded. The mobile state is opt-in
  // (the user clicks the menu button).
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // We don't track viewport width in JS — the layout
  // uses Tailwind responsive classes. The `mobileNavOpen`
  // state is the only viewport-driven state and it
  // belongs to the user (not the viewport).
  const desktopState: AppSidebarState = "expanded" // F1 Sidebar will read its own
  // collapsed pref from localStorage; this is just the
  // initial state the layout hands in.

  return (
    <div
      data-theme="dark"
      className="flex min-h-screen bg-background text-foreground"
    >
      {/* Desktop sidebar (hidden on mobile). */}
      <div className="hidden md:block">
        <AppSidebar state={desktopState} />
      </div>

      {/* Mobile drawer (Radix Dialog under the hood). */}
      {mobileNavOpen ? (
        <MobileNavOverlay onClose={() => setMobileNavOpen(false)}>
          <AppSidebar state="mobile" onClose={() => setMobileNavOpen(false)} />
        </MobileNavOverlay>
      ) : null}

      {/* Main column: topbar + content. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className={cn(
            "sticky top-0 z-30 flex h-14 w-full items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur",
          )}
        >
          <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
          {/* UserMenu lives in the end slot of the topbar;
              importing it here keeps the topbar file
              single-purpose. */}
          <div className="ml-auto -mr-2 flex items-center gap-2 pr-2">
            <UserMenu />
          </div>
        </div>
        {/* RateLimitBanner is the (app) shell's
            shared 429 surface (F4 Part 4, Task 97).
            It mounts below the topbar so the count-down
            is always visible. Sits `sticky` to stay put
            while the user scrolls. */}
        <RateLimitBanner />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}

/**
 * Mobile nav overlay — a fixed-position sheet that
 * covers the viewport below the `md` breakpoint. The
 * F1 `Drawer` primitive lives in `@cortex/ui`; for F3
 * Part 1 we keep this minimal (no animations yet —
 * they land in F3 Part 2 alongside the rest of the
 * dashboard polish).
 */
function MobileNavOverlay({
  children,
  onClose,
}: {
  children: ReactNode
  onClose: () => void
}) {
  // Close on Escape.
  useEffect(() => {
    if (typeof window === "undefined") return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative h-full w-72 max-w-[85vw] bg-card">{children}</div>
    </div>
  )
}
