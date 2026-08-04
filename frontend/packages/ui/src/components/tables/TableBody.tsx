/**
 * TableBody — semantic `<tbody>`.
 *
 * **F1 Part 3 (Task 26).** Maps directly to the native
 * `<tbody>`. Use it to wrap `<TableRow>`s of data.
 *
 * **Empty slot.** Pass `children` as a falsy value when the
 * data set is empty and the call site wants to render an
 * `<EmptyState>` row. (Most F2+ pages will render the
 * EmptyState outside the table entirely — this prop is
 * the opt-in for tables that want a centred "No data" row.)
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
)
TableBody.displayName = "TableBody"

export { TableBody }
