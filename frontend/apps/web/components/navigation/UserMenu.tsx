/**
 * UserMenu — avatar + dropdown in the topbar.
 *
 * Header: name (derived from the email), email, workspace and role, all from
 * the session. Items link only to pages that exist; Log out clears the
 * session and returns to /login.
 */

"use client"

import { useRouter } from "next/navigation"

import { Icon, type UserMenuItem, UserMenu as UserMenuPrimitive } from "@cortex/ui"

import { useAuthStore } from "@/lib/auth/store"

function displayName(email: string | null | undefined): string {
  if (!email) return "User"
  const local = email.split("@", 1)[0] ?? "User"
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || local
  )
}

export function UserMenu() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const logout = useAuthStore((s) => s.logout)

  const email = user?.email ?? undefined
  const name = displayName(email)
  const workspace = tenant?.workspace ?? tenant?.slug

  const items: UserMenuItem[] = [
    {
      iconLeft: <Icon name="KeyRound" className="h-4 w-4" />,
      onSelect: () => router.push("/app/settings/api-keys" as never),
      children: "API keys",
    },
    {
      iconLeft: <Icon name="ChartColumn" className="h-4 w-4" />,
      onSelect: () => router.push("/app/settings/usage" as never),
      children: "Usage",
    },
    {
      iconLeft: <Icon name="LogOut" className="h-4 w-4" />,
      tone: "destructive",
      onSelect: async () => {
        await logout()
        router.push("/login" as never)
      },
      children: "Log out",
    },
  ]

  return (
    <UserMenuPrimitive
      name={name}
      email={email}
      items={items}
      footer={
        workspace ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            <span className="text-faint">Workspace</span> {workspace}
            {user?.role ? <span className="text-faint"> · {user.role}</span> : null}
          </p>
        ) : undefined
      }
    />
  )
}
