/**
 * Sidebar — the primary nav rail.
 *
 * **F1 Part 3 (Task 27).** The left rail of the authenticated
 * app. Houses the Logo, a vertical list of `SidebarItem`s
 * (optionally grouped into `SidebarSection`s), and a
 * `SidebarFooter` slot for the user menu.
 *
 * **Layout.**
 *   - `expanded` (default) — `w-64` (256px).
 *   - `collapsed` — `w-16` (64px) with icons only.
 *   - `mobile` — full-height drawer (the parent layout
 *     owns the toggle and the overlay; F1 just provides
 *     the surface).
 *
 * **No routing.** F1 ships the visual only. The call site
 * wires each `SidebarItem` to a route via `next/link`'s
 * `asChild` pattern.
 *
 * **Used by.** `(app)/layout.tsx` in `apps/web`.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export type SidebarState = "expanded" | "collapsed" | "mobile"

const STATE = {
  expanded: "w-64",
  collapsed: "w-16",
  mobile: "w-full max-w-xs",
} as const

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  /** Default `expanded`. */
  state?: SidebarState
}

const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  ({ className, state = "expanded", ...props }, ref) => (
    <aside
      ref={ref}
      data-state={state}
      className={cn(
        "flex h-full flex-col border-r border-border bg-card text-card-foreground",
        "transition-[width] duration-200 ease-out",
        STATE[state],
        className,
      )}
      {...props}
    />
  ),
)
Sidebar.displayName = "Sidebar"

export { Sidebar }
