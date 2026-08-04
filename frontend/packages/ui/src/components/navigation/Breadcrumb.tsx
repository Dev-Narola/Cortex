/**
 * Breadcrumb — the path indicator above a page title.
 *
 * **F1 Part 3 (Task 28).** Renders an ordered list of
 * links separated by a chevron. The last item is
 * rendered as plain text (the "current page" state).
 *
 * **Slots.**
 *   - `items` — `{ label, href?, icon? }[]` array.
 *     Items without an `href` render as the current page.
 *   - `separator` — custom separator (defaults to a
 *     `ChevronRight` lucide icon).
 *
 * **Collapsing.** When `maxItems` is set, the breadcrumb
 * truncates middle items to a "…" ellipsis. The first
 * and last items are always shown.
 *
 * **Used by.** Graph, Settings, Admin, Documents.
 */

import { ChevronRight, MoreHorizontal } from "lucide-react"
import { type HTMLAttributes, type ReactNode, forwardRef } from "react"

import { cn } from "../../utils/cn"

export interface BreadcrumbItem {
  label: string
  href?: string
  icon?: ReactNode
}

export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[]
  /** Custom separator node. Defaults to `ChevronRight`. */
  separator?: ReactNode
  /** Collapse middle items beyond this count. */
  maxItems?: number
}

const Breadcrumb = forwardRef<HTMLElement, BreadcrumbProps>(
  ({ className, items, separator, maxItems, ...props }, ref) => {
    const shouldCollapse = maxItems && items.length > maxItems
    const visible = shouldCollapse ? [items[0] ?? null, null, ...items.slice(-1)] : items
    return (
      <nav
        ref={ref}
        aria-label="Breadcrumb"
        className={cn("flex items-center text-sm text-muted-foreground", className)}
        {...props}
      >
        <ol className="flex flex-wrap items-center gap-1.5 break-words">
          {visible.map((item, idx) => {
            if (!item) {
              return (
                <li key="ellipsis" className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </span>
                  <span aria-hidden className="text-muted-foreground/50">
                    {separator ?? <ChevronRight className="h-3.5 w-3.5" />}
                  </span>
                </li>
              )
            }
            const isLast = idx === visible.length - 1
            return (
              <li key={`${item.label}-${idx}`} className="flex items-center gap-1.5">
                {item.href && !isLast ? (
                  <a
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:text-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                  >
                    {item.icon ? (
                      <span aria-hidden className="shrink-0">
                        {item.icon}
                      </span>
                    ) : null}
                    {item.label}
                  </a>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-1.5 py-0.5",
                      isLast ? "font-medium text-foreground" : "",
                    )}
                  >
                    {item.icon ? (
                      <span aria-hidden className="shrink-0">
                        {item.icon}
                      </span>
                    ) : null}
                    {item.label}
                  </span>
                )}
                {!isLast ? (
                  <span aria-hidden className="text-muted-foreground/50">
                    {separator ?? <ChevronRight className="h-3.5 w-3.5" />}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ol>
      </nav>
    )
  },
)
Breadcrumb.displayName = "Breadcrumb"

export { Breadcrumb }
