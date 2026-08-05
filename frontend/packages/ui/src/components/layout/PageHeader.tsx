/**
 * PageHeader — the title + description + actions row at the
 * top of a page.
 *
 * **F1 Part 4 (Task 36).** Lays out: title (and optional
 * description / breadcrumb) on the left, action buttons on
 * the right. Wraps to a column on mobile.
 *
 * **Slots.**
 *   - `title` — required. Page heading (h1).
 *   - `description` — optional supporting text.
 *   - `breadcrumb` — optional `<Breadcrumb>` slot.
 *   - `actions` — optional right-aligned action buttons.
 *   - `children` — escape hatch for fully custom layouts.
 *
 * **No business logic.** The header is visual only; the
 * call site wires the breadcrumb items + the action
 * buttons.
 */

import type { HTMLAttributes, ReactNode } from "react"

import { cn } from "../../utils/cn"

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode
  description?: ReactNode
  breadcrumb?: ReactNode
  actions?: ReactNode
}

const PageHeader = ({
  className,
  title,
  description,
  breadcrumb,
  actions,
  children,
  ...props
}: PageHeaderProps) => (
  <header className={cn("flex flex-col gap-3 border-b border-border pb-4", className)} {...props}>
    {breadcrumb ? <div className="-mb-1">{breadcrumb}</div> : null}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
    {children}
  </header>
)
PageHeader.displayName = "PageHeader"

export { PageHeader }
