/**
 * AppSidebar — the permanent left rail for the authenticated app.
 *
 * **F3 Part 1 (Task 2).** Composes the F1 `Sidebar` primitive
 * with our app-specific nav list (`SidebarNav`), the
 * workspace switcher (`SidebarWorkspace`), and a footer
 * slot (`SidebarFooter` for the user menu).
 *
 * **State machine.**
 *   - `expanded`  — desktop, ≥1024px. `w-64`.
 *   - `collapsed` — desktop, ≥1024px, user toggled. `w-16`.
 *   - `mobile`    — <1024px. Rendered inside a Radix
 *     Dialog (the parent layout owns the toggle + overlay).
 *
 * **Persistence.** The `expanded` ↔ `collapsed` choice
 * persists in `localStorage` under `cortex.sidebar.collapsed`.
 * The mobile state never persists (it's purely viewport-
 * driven).
 *
 * **Keyboard.** Tab moves between items. `Ctrl/Cmd+B`
 * toggles between expanded + collapsed (the standard
 * shadcn/Radix convention). The mobile drawer opens
 * via the Topbar's menu button and traps focus while open.
 *
 * **No routing.** The nav list (Task 2) wires each item
 * to a route via `next/link`'s `asChild` pattern.
 *
 * **Per the spec.** Routes that aren't implemented yet
 * render as `disabled` (greyed out + `Coming Soon` hint
 * in the tooltip) rather than navigating to a half-built
 * page.
 */

"use client"

import { useEffect, useState, type ReactNode } from "react"

import { Icon, Sidebar, TooltipRoot } from "@cortex/ui"

import { SidebarFooter } from "./SidebarFooter"
import { SidebarNav } from "./SidebarNav"
import { SidebarWorkspace } from "./SidebarWorkspace"

const COLLAPSED_KEY = "cortex.sidebar.collapsed"

export type AppSidebarState = "expanded" | "collapsed" | "mobile"

export interface AppSidebarProps {
  /** `mobile` for the drawer variant; `expanded`/`collapsed` for the rail. */
  state: AppSidebarState
  /** When true, render the close button (drawer mode). */
  onClose?: () => void
}

export function AppSidebar({ state, onClose }: AppSidebarProps): ReactNode {
  // Persist the user's expanded/collapsed preference.
  // The mobile variant never reads or writes this.
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (state === "mobile") return
    const stored = window.localStorage.getItem(COLLAPSED_KEY)
    if (stored === "1") setCollapsed(true)
  }, [state])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (state === "mobile") return
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0")
  }, [collapsed, state])

  // Ctrl/Cmd+B toggles expanded ↔ collapsed.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (state === "mobile") return
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && (e.key === "b" || e.key === "B")) {
        e.preventDefault()
        setCollapsed((c) => !c)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [state])

  const resolvedState: AppSidebarState =
    state === "mobile" ? "mobile" : collapsed ? "collapsed" : "expanded"

  return (
    <Sidebar state={resolvedState} aria-label="Primary navigation">
      {/* Workspace switcher at the top (Task 3). */}
      <SidebarWorkspace collapsed={resolvedState !== "expanded"} onClose={onClose} />

      {/* The nav list. */}
      <div className="flex-1 overflow-y-auto py-2">
        <SidebarNav collapsed={resolvedState === "collapsed"} />
      </div>

      {/* Footer — user menu + theme toggle. */}
      <SidebarFooter collapsed={resolvedState === "collapsed"} />

      {/* Collapse toggle (only in desktop states). */}
      {state !== "mobile" ? (
        <div className="border-t border-border p-2">
          <TooltipRoot content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
              className="flex h-8 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Icon
                name={collapsed ? "ChevronsRight" : "ChevronsLeft"}
                className="h-4 w-4"
              />
            </button>
          </TooltipRoot>
        </div>
      ) : null}
    </Sidebar>
  )
}
