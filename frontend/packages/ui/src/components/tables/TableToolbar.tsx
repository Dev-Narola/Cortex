/**
 * TableToolbar — the row above the table.
 *
 * **F1 Part 3 (Task 26).** Lays out: a title + description
 * on the left, and a slot for actions (filter chips,
 * "Add new" button, bulk actions) on the right. Lays the
 * groundwork for F2+'s data tables — F1 just provides the
 * chrome; the feature composes the actions slot.
 *
 * **Layout.** Stacks on mobile (title above, actions
 * below), row on `sm:` and up.
 *
 * **Slots.**
 *   - `title` — heading text (string or ReactNode).
 *   - `description` — supporting text under the title.
 *   - `actions` — right-aligned action buttons / menus.
 *   - `children` — if both title/description are omitted,
 *     the toolbar renders the children directly (escape
 *     hatch for fully custom layouts).
 */

import type { HTMLAttributes } from "react"

import { cn } from "../../utils/cn"

export interface TableToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}

const TableToolbar = ({
  className,
  title,
  description,
  actions,
  children,
  ...props
}: TableToolbarProps) => (
  <div
    className={cn(
      "flex flex-col gap-2 border-b border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
      className,
    )}
    {...props}
  >
    {title || description ? (
      <div className="min-w-0 flex-1">
        {title ? (
          <div className="font-display text-base font-semibold leading-none tracking-tight">
            {title}
          </div>
        ) : null}
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
    ) : null}
    {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    {children}
  </div>
)
TableToolbar.displayName = "TableToolbar"

export { TableToolbar }
