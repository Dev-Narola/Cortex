/**
 * Pagination — table page navigator.
 *
 * **F1 Part 3 (Task 29).** Renders a previous/next pair
 * with page numbers and an ellipsis for large ranges.
 * No data hooks — the call site owns the state
 * (`currentPage`, `totalPages`, `onPageChange`).
 *
 * **Layout.** Desktop: full row of buttons (prev, page
 * numbers, next). Mobile (`compact`): just prev / next
 * with a "Page 3 of 12" caption.
 *
 * **Ellipsis.** When `totalPages > 7` the centre pages
 * collapse to a "…" element. The first and last two
 * pages are always shown.
 *
 * **Used by.** Every data-heavy table (Documents, Users,
 * API Keys, Billing, Audit Logs).
 */

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"
import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"
import { Button } from "../buttons/Button"

export interface PaginationProps extends HTMLAttributes<HTMLElement> {
  /** Current 1-indexed page. */
  currentPage: number
  /** Total number of pages. */
  totalPages: number
  /** Called with the new 1-indexed page. */
  onPageChange: (page: number) => void
  /** Show the surrounding pages (e.g. `1` and `12`) — default `2`. */
  siblingCount?: number
  /** Render the mobile compact view. Default `false`. */
  compact?: boolean
  /** Disable all controls. Default `false`. */
  disabled?: boolean
  /** Accessible label. Default `"Pagination"`. */
  ariaLabel?: string
}

/**
 * Build the page list with ellipsis markers.
 * Returns an array of either a page number (number) or
 * `null` (ellipsis marker).
 */
function buildPageRange(current: number, total: number, siblings: number): Array<number | null> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const left = Math.max(1, current - siblings)
  const right = Math.min(total, current + siblings)
  const pages: Array<number | null> = [1]
  if (left > 2) pages.push(null)
  for (let p = left; p <= right; p++) {
    if (p !== 1 && p !== total) pages.push(p)
  }
  if (right < total - 1) pages.push(null)
  pages.push(total)
  return pages
}

const Pagination = forwardRef<HTMLElement, PaginationProps>(
  (
    {
      className,
      currentPage,
      totalPages,
      onPageChange,
      siblingCount = 1,
      compact = false,
      disabled = false,
      ariaLabel = "Pagination",
      ...props
    },
    ref,
  ) => {
    const safeCurrent = Math.min(Math.max(1, currentPage), Math.max(1, totalPages))
    const isFirst = safeCurrent <= 1
    const isLast = safeCurrent >= totalPages
    const range = buildPageRange(safeCurrent, totalPages, siblingCount)

    if (compact) {
      return (
        <nav
          ref={ref}
          aria-label={ariaLabel}
          className={cn("flex items-center gap-2", className)}
          {...props}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(safeCurrent - 1)}
            disabled={disabled || isFirst}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {safeCurrent} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(safeCurrent + 1)}
            disabled={disabled || isLast}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      )
    }

    return (
      <nav
        ref={ref}
        aria-label={ariaLabel}
        className={cn("flex flex-wrap items-center gap-1", className)}
        {...props}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(safeCurrent - 1)}
          disabled={disabled || isFirst}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <ol className="flex items-center gap-1">
          {range.map((page) =>
            page === null ? (
              <li
                key="ellipsis"
                aria-hidden
                className="flex h-8 w-8 items-center justify-center text-muted-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </li>
            ) : (
              <li key={page}>
                <Button
                  variant={page === safeCurrent ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onPageChange(page)}
                  disabled={disabled}
                  aria-current={page === safeCurrent ? "page" : undefined}
                  aria-label={`Page ${page}`}
                  className="h-8 min-w-[2rem] px-2"
                >
                  {page}
                </Button>
              </li>
            ),
          )}
        </ol>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(safeCurrent + 1)}
          disabled={disabled || isLast}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    )
  },
)
Pagination.displayName = "Pagination"

export { Pagination }
