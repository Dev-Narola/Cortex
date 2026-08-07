/**
 * SidebarWorkspace — the workspace switcher at the top of
 * the sidebar.
 *
 * **F3 Part 1 (Task 3).** Shows the current tenant's
 * name, an avatar (initials fallback), and the plan.
 *
 * **F2 state source.** The data comes from the F2
 * `useAuthStore` — specifically the `tenant` field that
 * `setTenant` / `completeOnboarding` write to.
 *
 * **Single tenant (today).** Per the spec, F3 only
 * supports *one* workspace. The dropdown that would
 * list "other workspaces" is reserved for F4+; the
 * button is rendered as a non-interactive pill so the
 * visual layout is correct (a misclick shouldn't do
 * anything) and the upcoming feature has a natural
 * place to land.
 *
 * **Collapsed.** When the sidebar is collapsed, we
 * render just the avatar + the workspace name as a
 * `TooltipRoot` — saves the 64px of horizontal space.
 */

"use client"

import { useAuthStore } from "@/lib/auth/store"

import { Avatar, TooltipRoot } from "@cortex/ui"

export interface SidebarWorkspaceProps {
  /** Hide the name + plan labels (icon-only mode). */
  collapsed?: boolean
  /** Optional close handler for the mobile drawer. */
  onClose?: () => void
}

/** Derive a friendly plan label from the workspace. The
 *  plan isn't in the F2 auth-store payload yet (the
 *  `POST /tenants` response shape doesn't carry it),
 *  so we show "Workspace" as a sensible default. F3+
 *  will surface the actual `Plan` enum once the
 *  `GET /tenants/me` response is wired in. */
function planLabel(): string {
  return "Free"
}

/** Build the avatar's `name` prop. The F1 `Avatar`
 *  uses it to render initials + an accessible label. */
function buildAvatarName(workspaceName: string, slug: string): string {
  const src = (workspaceName ?? "").trim()
  if (src) {
    return src
      .split(/\s+/)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .slice(0, 2)
      .join("") || slug
  }
  return (slug || "WS").slice(0, 2).toUpperCase()
}

export function SidebarWorkspace({ collapsed = false, onClose }: SidebarWorkspaceProps) {
  const tenant = useAuthStore((s) => s.tenant)
  const workspaceName = tenant?.workspace ?? tenant?.slug ?? "Workspace"
  const slug = tenant?.slug ?? "workspace"
  const avatarName = buildAvatarName(workspaceName, slug)
  const displayPlan = planLabel()

  if (collapsed) {
    return (
      <div className="flex h-14 items-center justify-center border-b border-border px-2">
        <TooltipRoot content={`${workspaceName} · ${displayPlan}`} side="right">
          <button
            type="button"
            onClick={onClose}
            aria-label={`${workspaceName} workspace`}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Avatar name={avatarName} size="sm" />
          </button>
        </TooltipRoot>
      </div>
    )
  }

  return (
    <div className="flex h-14 items-center gap-3 border-b border-border px-3">
      <Avatar name={avatarName} size="sm" />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-semibold text-foreground"
          title={workspaceName}
        >
          {workspaceName}
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
          {displayPlan}
          <span className="opacity-50">·</span>
          <span className="truncate">/{slug}</span>
        </p>
      </div>
    </div>
  )
}
