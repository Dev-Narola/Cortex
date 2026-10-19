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
 *   4. `<AppShell>` — the actual UI: sidebar + main
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

import { usePathname } from "next/navigation"
import { type ReactNode, useState } from "react"

import { Drawer, DrawerContent, DrawerTitle } from "@cortex/ui"

import { OnboardingGuard, ProtectedRoute } from "@/components/auth"
import { DocumentDetailHost } from "@/components/documents/DocumentDetailHost"
import { RateLimitBanner } from "@/components/feedback/RateLimitBanner"
import { AppSidebar, type AppSidebarState } from "@/components/navigation/AppSidebar"
import { BreadcrumbProvider } from "@/components/navigation/BreadcrumbProvider"
import { navItemFor } from "@/components/navigation/SidebarNav"
import { Topbar } from "@/components/navigation/Topbar"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <OnboardingGuard>
        <BreadcrumbProvider>
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
        </BreadcrumbProvider>
      </OnboardingGuard>
    </ProtectedRoute>
  )
}

function AppShell({ children }: { children: ReactNode }) {
  // The entry animation replays per nav section, not per URL, so switching
  // conversations or opening a document doesn't remount the section's layout.
  const pathname = usePathname() ?? ""
  // Chat, documents and the graph are edge-to-edge workspaces; other pages sit in a padded column.
  const fullBleed = /^\/(chat|app\/documents|app\/graph)(\/|$)/.test(pathname)
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
    <div className="flex h-dvh overflow-hidden bg-ambient text-foreground">
      {/* Desktop sidebar (hidden on mobile). */}
      <div className="hidden md:block">
        <AppSidebar state={desktopState} />
      </div>

      {/* Mobile drawer: Radix Dialog gives the focus trap, Esc and focus return. */}
      <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DrawerContent
          side="left"
          aria-describedby={undefined}
          className="animate-slide-in-from-left w-72 max-w-[85vw] gap-0 border-border bg-background-2 p-0 md:hidden"
        >
          <DrawerTitle className="sr-only">Navigation</DrawerTitle>
          <AppSidebar state="mobile" onClose={() => setMobileNavOpen(false)} />
        </DrawerContent>
      </Drawer>

      {/* Main column: topbar + content. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <RateLimitBanner />
        <main
          id="main"
          className={
            fullBleed
              ? "flex-1 overflow-y-auto"
              : "flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7 lg:px-10"
          }
        >
          <div
            key={navItemFor(pathname)?.href ?? pathname}
            className={fullBleed ? "animate-rise-in h-full" : "animate-rise-in"}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
