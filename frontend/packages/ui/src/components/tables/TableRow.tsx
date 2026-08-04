/**
 * TableRow — semantic `<tr>` with selection + interactive
 * states.
 *
 * **F1 Part 3 (Task 26).** Maps directly to the native
 * `<tr>`. Adds the hover/selected/data-state visual
 * layers the design system uses everywhere (matching the
 * Card system).
 *
 * **States.** `default | selected | disabled | loading`.
 * `selected` paints a left border in the brand colour
 * (matching `<Card state="selected">`).
 *
 * **Interactive.** Pass `interactive` for click-to-open
 * rows (the agent list, the document picker). Adds a
 * hover surface and `cursor-pointer`.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export type TableRowState = "default" | "selected" | "disabled" | "loading"

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  state?: TableRowState
  interactive?: boolean
}

const STATE = {
  default: "",
  selected: "bg-ember-500/5 data-[state=selected]:bg-ember-500/10",
  disabled: "opacity-50 pointer-events-none",
  loading: "opacity-70 pointer-events-none",
} as const

const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, state = "default", interactive, ...props }, ref) => (
    <tr
      ref={ref}
      data-state={state === "default" ? undefined : state}
      className={cn(
        "border-b border-border transition-colors",
        interactive ? "hover:bg-muted/40 cursor-pointer" : "",
        STATE[state],
        className,
      )}
      {...props}
    />
  ),
)
TableRow.displayName = "TableRow"

export { TableRow }
