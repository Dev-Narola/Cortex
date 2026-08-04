/**
 * DialogHeader — top section of a Dialog.
 *
 * **F1 Part 3 (Task 22).** Typically holds a `DialogTitle` and
 * a `DialogDescription`, but accepts any children so a custom
 * header (e.g. a logo + title row) can be composed.
 *
 * **Layout.** `flex flex-col` with `space-y-1.5` so the title and
 * description sit close together. `text-left` is the default
 * (LTR) — pass `text-center` via `className` for confirmations
 * with a centred icon header.
 */

import type { HTMLAttributes } from "react"

import { cn } from "../../utils/cn"

const DialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-left", className)} {...props} />
)
DialogHeader.displayName = "DialogHeader"

export { DialogHeader }
