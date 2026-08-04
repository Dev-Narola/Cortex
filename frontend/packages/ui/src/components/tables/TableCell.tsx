/**
 * TableCell — `<th>` and `<td>` in one.
 *
 * **F1 Part 3 (Task 26).** Defaults to `<td>`. Pass
 * `head` to render a `<th>` with the muted header
 * typography baked in.
 *
 * **Padding axis.** `sm | md` — `sm` is for dense tables
 * (audit logs, conversation lists). Default `md`.
 *
 * **Align axis.** `left | center | right` — numeric
 * columns on a finance / usage screen get `right`.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const PADDING = {
  sm: "px-3 py-2",
  md: "px-4 py-3",
} as const

const ALIGN = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const

export type TableCellTag = "td" | "th"
export type TableCellPadding = keyof typeof PADDING
export type TableCellAlign = keyof typeof ALIGN

export interface TableCellProps extends HTMLAttributes<HTMLTableCellElement> {
  /** Default `td`. Use `"th"` to render as a header cell. */
  tag?: TableCellTag
  /** Default `md`. */
  padding?: TableCellPadding
  /** Default `left`. Numeric columns usually set `right`. */
  align?: TableCellAlign
  /** Shorthand for `tag="th"` + the muted header typography. */
  head?: boolean
}

const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, tag = "td", padding = "md", align = "left", head, ...props }, ref) => {
    const isHeader = head || tag === "th"
    const classNames = cn(
      PADDING[padding],
      ALIGN[align],
      isHeader
        ? "text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        : "text-sm text-foreground",
      className,
    )
    if (tag === "th") {
      return <th ref={ref} className={classNames} {...props} />
    }
    return <td ref={ref} className={classNames} {...props} />
  },
)
TableCell.displayName = "TableCell"

/**
 * Header-cell alias. Renders a `<th>` with the muted
 * header typography baked in.
 */
const TableHead = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, ...props }, ref) => (
    <TableCell ref={ref} tag="th" head className={className} {...props} />
  ),
)
TableHead.displayName = "TableHead"

export { TableCell, TableHead }
