/**
 * Tables — barrel for Table + compound parts.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * **F1 Part 3 (Task 26).** Foundation only — the visual
 * chrome (Table, TableHeader, TableBody, TableRow, TableCell,
 * TableHead, TableToolbar). No filtering, no sorting
 * logic, no row-level action hooks. F2+ features compose
 * these primitives with their own data hooks.
 *
 * **Pagination** lives in `components/navigation/` per
 * the F1 spec (it composes with any future list view,
 * not just tables).
 *
 * **Used by.** Documents (F3), Users (F5), API Keys
 * (F7), Billing (F7), Audit Logs (F7).
 */

export { Table } from "./Table"
export { type TableHeaderProps, TableHeader } from "./TableHeader"
export { TableBody } from "./TableBody"
export {
  type TableCellAlign,
  type TableCellPadding,
  type TableCellProps,
  type TableCellTag,
  TableCell,
  TableHead,
} from "./TableCell"
export { type TableRowProps, type TableRowState, TableRow } from "./TableRow"
export { type TableToolbarProps, TableToolbar } from "./TableToolbar"
