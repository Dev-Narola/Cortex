/**
 * Settings — `/app/settings/*`.
 *
 * **F7 Part 1 (Task 4).** The Settings shell. The
 * layout renders the page heading, the subtitle,
 * and the left-rail navigation. The active tab
 * content sits to the right of the rail.
 *
 * **Why a dedicated layout.** The F2 stub at
 * `/app/settings` used Radix Tabs inline on a
 * single page. The F7 layout moves to
 * route-driven tabs (one URL per area) so:
 *   1. The browser back/forward buttons work
 *      naturally across Settings areas.
 *   2. Deep links (`/app/settings/team`,
 *      `/app/settings/api-keys`) are shareable.
 *   3. Each Settings area is a self-contained
 *      route — easier to load on demand.
 *
 * **What the layout does NOT do.** It doesn't
 * load team data, render the invite modal,
 * decide on permissions — those belong to the
 * per-route page (e.g. `team/page.tsx`). The
 * layout is chrome only.
 *
 * **Visual shell.** Per the UI spec:
 *
 *   ┌────────────────────────────────────┐
 *   │ Settings                          │
 *   │ Manage your workspace…            │
 *   │ ┌────────┬──────────────────────┐ │
 *   │ │ Team   │                      │ │
 *   │ │ Keys   │     {children}       │ │
 *   │ │ MCP    │                      │ │
 *   │ │ Usage  │                      │ │
 *   │ │ Audit  │                      │ │
 *   │ └────────┴──────────────────────┘ │
 *   └────────────────────────────────────┘
 *
 * The 28px / 1.25 line-height / 600 weight comes
 * from the UI spec's "Page Title" token (the same
 * scale used by every other `(app)` page). The
 * subtitle copy is a short, descriptive line.
 */
import type { ReactNode } from "react"

import { SettingsTabs } from "@/components/settings/settings-tabs"

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-testid="settings-layout" className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="space-y-1">
        <h1 className="font-display text-[28px] font-semibold leading-[1.25] tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-paper-200/70">
          Manage your workspace, access, and platform configuration.
        </p>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <SettingsTabs />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
