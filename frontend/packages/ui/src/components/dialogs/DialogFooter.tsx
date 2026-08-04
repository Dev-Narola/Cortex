/**
 * DialogFooter — bottom action row of a Dialog.
 *
 * **F1 Part 3 (Task 22).** Stacks the Cancel/Confirm action
 * pattern: on mobile the buttons stack vertically (Cancel
 * first so the Confirm button — the primary action — is
 * closest to the thumb), and on `sm:` and up they sit in a
 * row with the Cancel on the left and the Confirm on the
 * right.
 *
 * **Custom layouts.** Pass `className` to override the layout
 * (e.g. `flex-row justify-between` for a destructive action
 * on the left + a confirm on the right).
 */

import type { HTMLAttributes } from "react"

import { cn } from "../../utils/cn"

const DialogFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

export { DialogFooter }
