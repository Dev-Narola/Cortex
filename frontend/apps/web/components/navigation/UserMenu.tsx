/**
 * UserMenu — the avatar + dropdown in the topbar.
 *
 * **F3 Part 1 (Task 5).** Built on the F1 `UserMenu`
 * primitive. Wires the F2 auth store (user + tenant) +
 * the F2 logout service.
 *
 * **Header.** Avatar + name + email (from the session).
 * The "workspace" line shows the tenant's display name
 * (or slug fallback).
 *
 * **Items.**
 *   - Profile  → `/app/settings` (settings is where the
 *                F4+ profile editor will live; for now
 *                it's a "go to settings" target)
 *   - Workspace → `/app/settings#workspace` (F4+ will
 *                have a dedicated settings page; for now
 *                we just link to settings)
 *   - Settings  → `/app/settings`
 *   - Log out   → `useAuthStore.logout()` + redirect to
 *                 `/login`. The store's `logout()` calls
 *                 the F2 logout service in the background.
 *
 * **Collapsed.** When the sidebar is collapsed, the
 * menu is icon-only — just the avatar trigger, no name
 * beside it.
 *
 * **Avatar fallback.** Uses the user's email's local
 * part as the initials source (the backend doesn't
 * surface a `name` field on the user yet).
 */

"use client"

import { useRouter } from "next/navigation"
import { useMemo } from "react"

import {
  Avatar,
  Icon,
  type UserMenuItem,
  UserMenu as UserMenuPrimitive,
} from "@cortex/ui"

import { useAuthStore } from "@/lib/auth/store"

export interface UserMenuProps {
  /** When true, render an icon-only trigger (for the collapsed sidebar). */
  collapsed?: boolean
}

function initialsFromEmail(email: string | null | undefined): string {
  if (!email) return "?"
  const local = email.split("@", 1)[0] ?? "?"
  // "ada.lovelace" → "AL", "ada" → "A", "a" → "A".
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
  }
  return (local.slice(0, 2) || "?").toUpperCase()
}

function displayName(email: string | null | undefined): string {
  if (!email) return "User"
  const local = email.split("@", 1)[0] ?? "User"
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ") || local
}

export function UserMenu({ collapsed = false }: UserMenuProps) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const logout = useAuthStore((s) => s.logout)

  const email = user?.email ?? null
  const name = displayName(email)
  const initials = useMemo(() => initialsFromEmail(email), [email])
  const workspaceName = tenant?.workspace ?? tenant?.slug ?? null

  const items: UserMenuItem[] = [
    {
      iconLeft: <Icon name="User" className="h-4 w-4" />,
      onSelect: () => {
        router.push("/app/settings" as never)
      },
      children: "Profile",
    },
    {
      iconLeft: <Icon name="House" className="h-4 w-4" />,
      onSelect: () => {
        router.push("/app/settings" as never)
      },
      children: "Workspace",
    },
    {
      iconLeft: <Icon name="Settings" className="h-4 w-4" />,
      onSelect: () => {
        router.push("/app/settings" as never)
      },
      children: "Settings",
    },
  ]

  async function onLogout() {
    // The store's `logout()` clears local state immediately
    // and POSTs to the backend in the background. We
    // redirect to /login right after so the user sees
    // the login page even if the network call is slow.
    await logout()
    router.push("/login" as never)
  }

  if (collapsed) {
    return (
      <UserMenuPrimitive
        name={name}
        email={email ?? undefined}
        items={items}
        footer={
          <UserMenuPrimitive
            // Re-use the primitive as the footer trigger
            // so the log-out item renders inside the
            // dropdown (not as a separate button).
            name={name}
            email={email ?? undefined}
            items={[
              {
                iconLeft: <Icon name="LogOut" className="h-4 w-4" />,
                onSelect: onLogout,
                tone: "destructive",
                children: "Log out",
              },
            ]}
          />
        }
      />
    )
  }

  // Expanded (default): name + email in the trigger
  // area, items below, log out as the footer.
  return (
    <div className="flex items-center gap-2">
      <UserMenuPrimitive
        name={name}
        email={email ?? undefined}
        items={items}
        footer={
          <div className="px-1 py-1">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Avatar name={initials} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{name}</p>
                {workspaceName ? (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {workspaceName}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Icon name="LogOut" className="h-4 w-4" />
              <span>Log out</span>
            </button>
          </div>
        }
      />
      <div className="hidden min-w-0 text-right text-xs leading-tight sm:block">
        <p className="truncate font-medium text-foreground" title={name}>
          {name}
        </p>
        <p className="truncate text-muted-foreground" title={email ?? undefined}>
          {email}
        </p>
      </div>
    </div>
  )
}
