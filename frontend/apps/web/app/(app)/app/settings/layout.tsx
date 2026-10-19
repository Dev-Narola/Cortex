/**
 * Settings — `/app/settings/*`.
 *
 * **F7 Part 1 (Task 4).** The Settings shell. The
 * layout renders the page heading, the subtitle,
 * and a segmented pill bar of tabs. The active tab
 * content sits below, at full width.
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
 */

import type { ReactNode } from "react"

import { PageHeader } from "@cortex/ui"

import { SettingsTabs } from "@/components/settings/settings-tabs"

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div data-testid="settings-layout" className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Your workspace's people, access keys, integrations, usage and audit trail."
      />
      <SettingsTabs />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
