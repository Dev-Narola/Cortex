/**
 * SidebarFooter — the bottom of the sidebar.
 *
 * **F3 Part 1 (Task 2).** Houses the theme toggle and a
 * second copy of the user menu (the topbar also has
 * one — same component, two placements).
 *
 * **Collapsed.** When the parent sidebar is collapsed,
 * the footer collapses to just a theme toggle (the user
 * menu's avatar becomes the workspace switcher's
 * avatar in the collapsed layout).
 */

"use client"

import { useTheme } from "next-themes"

import { Icon, TooltipRoot } from "@cortex/ui"

import { UserMenu } from "./UserMenu"

export interface SidebarFooterProps {
  /** Hide the user-menu label (icon-only mode). */
  collapsed?: boolean
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  return (
    <TooltipRoot content={isDark ? "Switch to light" : "Switch to dark"} side="right">
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        aria-pressed={isDark}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Icon name={isDark ? "Sun" : "Moon"} className="h-4 w-4" />
      </button>
    </TooltipRoot>
  )
}

export function SidebarFooter({ collapsed = false }: SidebarFooterProps) {
  if (collapsed) {
    return (
      <div className="flex items-center justify-center gap-1 border-t border-border p-2">
        <ThemeToggle />
        <UserMenu collapsed />
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 border-t border-border p-2">
      <ThemeToggle />
      <div className="flex-1">
        <UserMenu />
      </div>
    </div>
  )
}
