/**
 * TableHeader — semantic `<thead>`.
 *
 * **F1 Part 3 (Task 26).** Maps directly to the native
 * `<thead>`. Use it to wrap `<TableRow>`s of column
 * headers; each header cell is a `<TableHead>` (a styled
 * `<th>`).
 *
 * **Sticky.** Pass `sticky` to keep the header visible
 * during vertical scroll — used by the documents table
 * and the audit log.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {
  /** Sticky to the top of the scroll container. */
  sticky?: boolean
}

const TableHeader = forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  ({ className, sticky, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        "border-b border-border bg-muted/40 [&_tr]:border-b",
        sticky ? "sticky top-0 z-10 bg-muted/80 backdrop-blur-sm" : "",
        className,
      )}
      {...props}
    />
  ),
)
TableHeader.displayName = "TableHeader"

export { TableHeader }
