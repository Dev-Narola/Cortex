/**
 * Topbar — the top chrome of the authenticated app.
 *
 * start: mobile menu button + breadcrumb · centre: global search (⌘K)
 * end: theme toggle + user menu.
 *
 * The breadcrumb comes from a page override (`useBreadcrumb()`) when one is
 * registered, otherwise from the sidebar's nav definition, so labels match
 * the nav and raw ids (UUIDs) never show up as crumbs.
 */

"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { Breadcrumb, Icon, TooltipRoot, Topbar as TopbarPrimitive } from "@cortex/ui"

import { GlobalSearch } from "@/components/search/GlobalSearch"
import { ThemeToggle } from "@/components/theme-toggle"
import { useBreadcrumb } from "./BreadcrumbProvider"
import { navItemFor } from "./SidebarNav"
import { UserMenu } from "./UserMenu"

export interface TopbarProps {
  /** Mobile drawer open handler. */
  onOpenMobileNav?: () => void
}

const ID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-|^\d+$/i

export function crumbsFor(pathname: string): { label: string; href?: string }[] {
  const item = navItemFor(pathname)
  if (!item) return []
  const rest = pathname
    .slice(item.href.length)
    .split("/")
    .filter((s) => s && !ID_SEGMENT.test(s))
  if (rest.length === 0) return [{ label: item.label }]
  return [
    { label: item.label, href: item.href },
    ...rest.map((s) => ({ label: s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ") })),
  ]
}

export function Topbar({ onOpenMobileNav }: TopbarProps): ReactNode {
  const pathname = usePathname() ?? "/"
  const override = useBreadcrumb()
  const items = override && override.items.length > 0 ? override.items : crumbsFor(pathname)

  return (
    <TopbarPrimitive
      className="border-divider bg-background/70 backdrop-blur-xl"
      start={
        <>
          {onOpenMobileNav ? (
            <TooltipRoot content="Open navigation" side="bottom">
              <button
                type="button"
                onClick={onOpenMobileNav}
                aria-label="Open navigation"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
              >
                <Icon name="Menu" className="h-4 w-4" />
              </button>
            </TooltipRoot>
          ) : null}
          <Breadcrumb items={items} className="hidden min-w-0 sm:flex" />
        </>
      }
      center={<GlobalSearch />}
      end={
        <>
          <ThemeToggle />
          <UserMenu />
        </>
      }
    />
  )
}
