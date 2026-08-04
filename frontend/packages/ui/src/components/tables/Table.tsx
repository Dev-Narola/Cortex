/**
 * Table — the responsive scrolling surface.
 *
 * **F1 Part 3 (Task 26).** Wraps the native `<table>` in a
 * `div` with `overflow-x-auto` so wide tables scroll
 * horizontally on mobile without breaking the page layout.
 *
 * **No filtering logic.** This is the visual surface only.
 * Sorting, filtering, selection, and pagination live in the
 * feature hook layer (F2+). F1 ships the empty/loading slots
 * so the call site can compose without re-implementing the
 * table chrome.
 *
 * **Used by.** Documents, Users, API Keys, Billing, Audit
 * Logs — every data-heavy page.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  ),
)
Table.displayName = "Table"

export { Table }
