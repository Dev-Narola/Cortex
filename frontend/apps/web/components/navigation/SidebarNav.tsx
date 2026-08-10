/**
 * SidebarNav — the actual list of nav items.
 *
 * **F3 Part 1 (Task 2).** Maps the 8 app routes to the
 * F1 `SidebarItem` primitive. The list is the *single
 * source of truth* for what's in the sidebar; every other
 * "what's the app's nav?" answer should read from here.
 *
 * **Routes that aren't implemented yet** are rendered as
 * `disabled` with a `Coming Soon` hint (per the spec).
 * The spec is explicit: never navigate to half-built pages.
 *
 * **Active state** is derived from the current pathname
 * (via `usePathname`). The match is by `startsWith` for
 * the parent + exact-match for the leaf, so `/app/documents`
 * keeps `Documents` highlighted when the user is on
 * `/app/documents/123`.
 *
 * **Collapsed.** When the parent sidebar is `collapsed`,
 * the label is hidden and the icon centres itself
 * (handled by the F1 `SidebarItem`). We also wrap each
 * item in a `TooltipRoot` so the label is still discoverable.
 */

"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import {
  Icon,
  type IconName,
  SidebarItem,
  TooltipRoot,
} from "@cortex/ui"

type Status = "active" | "default" | "disabled"

interface NavItem {
  href: string
  label: string
  icon: IconName
  /** Coming soon — rendered as `disabled`. */
  comingSoon?: boolean
}

const NAV: readonly NavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: "House" },
  // F4 P1: the chat route lives at `/chat` (the
  // `(app)` group doesn't add a URL segment). The
  // old `/app/chat` link in this sidebar 404'd
  // because the route group is parens-only.
  { href: "/chat", label: "Chat", icon: "MessageSquare" },
  { href: "/app/documents", label: "Documents", icon: "FileText" },
  { href: "/app/search", label: "Search", icon: "Search", comingSoon: true },
  {
    href: "/app/graph",
    label: "Knowledge Graph",
    icon: "Network",
    comingSoon: true,
  },
  { href: "/app/agents", label: "Agents", icon: "Bot", comingSoon: true },
  { href: "/app/mcp", label: "MCP", icon: "Workflow", comingSoon: true },
  { href: "/app/settings", label: "Settings", icon: "Settings" },
] as const

function resolveStatus(pathname: string, href: string, comingSoon: boolean): Status {
  if (comingSoon) return "disabled"
  if (pathname === href) return "active"
  if (href !== "/app/dashboard" && pathname.startsWith(`${href}/`)) return "active"
  return "default"
}

export interface SidebarNavProps {
  /** Hide labels (icon-only mode). Default `false`. */
  collapsed?: boolean
}

export function SidebarNav({ collapsed = false }: SidebarNavProps): ReactNode {
  const pathname = usePathname() ?? ""

  return (
    <nav aria-label="App sections" className="px-2">
      <ul className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const status = resolveStatus(pathname, item.href, !!item.comingSoon)
          const labelText = item.comingSoon ? `${item.label} — Coming Soon` : item.label
          const inner = (
            <SidebarItem
              href={item.href as never}
              state={status}
              iconLeft={<Icon name={item.icon} className="h-4 w-4" />}
              aria-label={labelText}
              aria-disabled={status === "disabled" || undefined}
              tabIndex={status === "disabled" ? -1 : undefined}
              onClick={(e) => {
                if (status === "disabled") e.preventDefault()
              }}
            >
              {item.label}
              {item.comingSoon ? (
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Soon
                </span>
              ) : null}
            </SidebarItem>
          )

          return (
            <li key={item.href}>
              {collapsed ? (
                <TooltipRoot content={labelText} side="right">
                  {inner}
                </TooltipRoot>
              ) : (
                inner
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
