/**
 * SidebarNav — the app's navigation, grouped Workspace / Management / System.
 *
 * Single source of truth for the nav. Every entry is a working route backed
 * by a real endpoint; items whose endpoint is owner/admin-only on the backend
 * are hidden for other roles instead of leading to a 403.
 *
 * Active state: exact match, or prefix match for nested routes
 * (`/app/documents/123` keeps Documents active). Links are client-side
 * (`next/link` through SidebarItem's `asChild`). Collapsed mode hides the
 * labels and puts them in tooltips.
 */

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { Icon, type IconName, SidebarItem, TooltipRoot } from "@cortex/ui"

import { useAuthStore } from "@/lib/auth/store"

interface NavItem {
  href: string
  label: string
  icon: IconName
  /** Backend restricts this to owner/admin. */
  adminOnly?: boolean
}

interface NavGroup {
  label: string
  items: readonly NavItem[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/app/dashboard", label: "Dashboard", icon: "House" },
      { href: "/chat", label: "Chat", icon: "MessageSquare" },
      { href: "/app/documents", label: "Documents", icon: "FileText" },
      { href: "/app/search", label: "Search", icon: "Search" },
      { href: "/app/graph", label: "Knowledge Graph", icon: "Network" },
      { href: "/app/agents", label: "Agents", icon: "Bot" },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/app/settings/team", label: "Team", icon: "Users", adminOnly: true },
      { href: "/app/settings/api-keys", label: "API keys", icon: "KeyRound" },
      { href: "/app/settings/mcp", label: "MCP", icon: "Workflow" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/app/settings/usage", label: "Usage", icon: "ChartColumn" },
      { href: "/app/settings/audit-log", label: "Audit log", icon: "ScrollText", adminOnly: true },
    ],
  },
] as const

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

/** The nav entry owning `pathname` (longest matching prefix), if any. */
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((i) => isActive(pathname, i.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0]
}

export interface SidebarNavProps {
  /** Hide labels (icon-only mode). Default `false`. */
  collapsed?: boolean
}

export function SidebarNav({ collapsed = false }: SidebarNavProps): ReactNode {
  const pathname = usePathname() ?? ""
  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role === "owner" || role === "admin"

  return (
    <nav aria-label="App sections" className="flex flex-col gap-5 px-3">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((i) => isAdmin || !i.adminOnly)
        if (items.length === 0) return null
        return (
          <div key={group.label}>
            {collapsed ? (
              <div className="mx-3 mb-2 h-px bg-divider" aria-hidden />
            ) : (
              <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.06em] text-faint">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5" aria-label={collapsed ? group.label : undefined}>
              {items.map((item) => {
                const active = isActive(pathname, item.href)
                const link = (
                  <SidebarItem asChild state={active ? "active" : "default"}>
                    <Link href={item.href as never} aria-label={collapsed ? item.label : undefined}>
                      <Icon name={item.icon} className="h-4 w-4 shrink-0" aria-hidden />
                      {collapsed ? null : <span className="flex-1 truncate">{item.label}</span>}
                    </Link>
                  </SidebarItem>
                )
                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <TooltipRoot content={item.label} side="right">
                        {link}
                      </TooltipRoot>
                    ) : (
                      link
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
