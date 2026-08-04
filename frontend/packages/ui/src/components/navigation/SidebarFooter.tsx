/**
 * SidebarFooter — the bottom slot of the sidebar.
 *
 * **F1 Part 3 (Task 27).** Pinned to the bottom of the
 * sidebar (via `mt-auto` from the parent flex column).
 * Typically holds the `UserMenu` and a small "tenant"
 * indicator.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const SidebarFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("mt-auto flex flex-col gap-1 border-t border-border p-2", className)}
      {...props}
    />
  ),
)
SidebarFooter.displayName = "SidebarFooter"

export { SidebarFooter }
