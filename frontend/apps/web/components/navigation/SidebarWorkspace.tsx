/**
 * SidebarWorkspace — brand + current workspace at the top of the sidebar.
 *
 * Workspace name/slug come from the session; the plan comes from
 * `GET /tenants/me` and is simply omitted until it loads (never guessed).
 * Collapsed mode shows the logo mark only, with the workspace in a tooltip.
 */

"use client"

import Link from "next/link"

import { Logo, TooltipRoot } from "@cortex/ui"

import { useCurrentTenant } from "@/hooks/tenant/useCurrentTenant"
import { useAuthStore } from "@/lib/auth/store"

export interface SidebarWorkspaceProps {
  /** Logo mark only (icon rail). */
  collapsed?: boolean
  /** Mobile drawer close handler (navigating home closes the drawer). */
  onClose?: () => void
}

export function SidebarWorkspace({ collapsed = false, onClose }: SidebarWorkspaceProps) {
  const tenant = useAuthStore((s) => s.tenant)
  const { data: current } = useCurrentTenant()
  const name = current?.name ?? tenant?.workspace ?? tenant?.slug ?? "Workspace"
  const slug = current?.slug ?? tenant?.slug

  const home = (
    <Link
      href="/app/dashboard"
      onClick={onClose}
      aria-label="Cortex home"
      className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Logo size="md" showText={!collapsed} />
    </Link>
  )

  if (collapsed) {
    return (
      <div className="flex h-14 items-center justify-center border-b border-divider px-2">
        <TooltipRoot content={name} side="right">
          {home}
        </TooltipRoot>
      </div>
    )
  }

  return (
    <div className="border-b border-divider px-3 pb-3">
      <div className="flex h-14 items-center">{home}</div>
      <div className="glass rounded-lg px-3 py-2">
        <p className="truncate text-sm font-medium text-foreground" title={name}>
          {name}
        </p>
        <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          {slug ? <span className="truncate font-mono">/{slug}</span> : null}
          {current?.plan ? (
            <span className="rounded-full bg-brand/10 px-1.5 py-px font-medium capitalize text-brand">
              {current.plan}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  )
}
