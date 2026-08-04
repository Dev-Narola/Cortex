/**
 * SidebarSection — a labelled group of sidebar items.
 *
 * **F1 Part 3 (Task 27).** Renders a small caption label
 * above a vertical list of `SidebarItem`s. Used by the
 * sidebar to group "Workspace" / "Settings" / "Admin"
 * rows.
 *
 * **Collapsed.** When the parent `Sidebar` is
 * `collapsed`, the label hides and the items stack
 * without the caption.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export interface SidebarSectionProps extends HTMLAttributes<HTMLDivElement> {
  /** Caption shown above the group. */
  label?: string
}

const SidebarSection = forwardRef<HTMLDivElement, SidebarSectionProps>(
  ({ className, label, children, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1 px-2 py-3", className)} {...props}>
      {label ? (
        <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  ),
)
SidebarSection.displayName = "SidebarSection"

export { SidebarSection }
