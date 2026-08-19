/**
 * SettingsTabs — the left navigation for the Settings section.
 *
 * **F7 Part 1 (Tasks 5, 6, 8).** The five Settings areas
 * (Team / API Keys / MCP / Usage & Billing / Audit Log)
 * render as a left rail. The active state is derived
 * from `usePathname()` so deep links land on the right
 * tab without ceremony.
 *
 * **Why route-driven, not Radix-Tabs.** The Settings
 * areas are independent URLs (`/app/settings/team`,
 * `/app/settings/api-keys`, ...). A Radix Tabs primitive
 * with `value` controlled by the URL would be redundant —
 * `<Link>` + a pathname check is simpler, more
 * server-renderable, and lets the user middle-click
 * (or "Open in new tab") a Settings area. The F2 stub
 * page used Radix Tabs because the routes didn't
 * exist; the F7 Part 1 layout replaces it.
 *
 * **Active-state rule.** The leaf route (e.g.
 * `/app/settings/team`) sets the active state.
 * A `startsWith` match would over-match — the
 * Team tab should be active only on `/app/settings/team`,
 * not on `/app/settings/team/invite/abc` (a future
 * detail route). Part 1 doesn't have nested routes;
 * the rule is future-proof.
 *
 * **Visual shell.** Per the UI spec: a tabbed Slate
 * panel, left tab list, content right. The tabs are a
 * stacked list of `<Link>`s styled with the existing
 * design tokens (`text-paper-200/70` for the resting
 * state, `bg-slate-700/60 text-paper-50` for the
 * active state). No new colors.
 *
 * **"Coming soon" tabs.** API Keys / MCP / Usage /
 * Audit Log are F7-Part 2/3/4/5 work. The
 * corresponding routes exist as placeholders, but the
 * tab itself doesn't show a "Soon" badge — every
 * tab is reachable today. The placeholder route
 * shows its own "Coming in F7-Part N" notice.
 */
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Icon, type IconName } from "@cortex/ui"

interface SettingsTab {
  /** Route path (under `/app/settings/`). */
  href: `/app/settings/${string}`
  /** Display label. */
  label: string
  /** Lucide icon name. */
  icon: IconName
}

const TABS: readonly SettingsTab[] = [
  { href: "/app/settings/team", label: "Team", icon: "Users" },
  { href: "/app/settings/api-keys", label: "API Keys", icon: "KeyRound" },
  { href: "/app/settings/mcp", label: "MCP", icon: "Workflow" },
  { href: "/app/settings/usage", label: "Usage & Billing", icon: "ChartLine" },
  { href: "/app/settings/audit-log", label: "Audit Log", icon: "ScrollText" },
] as const

/**
 * Resolve the active tab from the current pathname.
 *
 * Exact match wins. The Settings section has no nested
 * routes today, so a `startsWith` match would over-match
 * any future `/app/settings/<leaf>/<something>` paths.
 * The helper is intentionally narrow.
 */
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  return pathname === href
}

export function SettingsTabs() {
  const pathname = usePathname() ?? ""

  return (
    <nav aria-label="Settings sections" className="w-full md:w-56 md:shrink-0">
      <ul className="flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href)
          return (
            <li key={tab.href} className="shrink-0 md:shrink">
              <Link
                href={tab.href as never}
                aria-current={active ? "page" : undefined}
                data-testid={`settings-tab-${tab.href.split("/").pop()}`}
                className={
                  active
                    ? "flex items-center gap-2 rounded-md bg-slate-700/60 px-3 py-2 text-sm font-medium text-paper-50 transition-colors"
                    : "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-paper-200/70 transition-colors hover:bg-slate-800/60 hover:text-paper-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
                }
              >
                <Icon name={tab.icon} size="sm" tone={active ? "accent" : "muted"} aria-hidden />
                <span className="whitespace-nowrap">{tab.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * Internal — re-exports the tab list so tests can
 * pin the canonical 5-tab order without scraping
 * the JSX. (Useful for the navigation test in
 * `tests/settings/team/settings-tabs.test.tsx`.)
 */
export const SETTINGS_TABS = TABS
