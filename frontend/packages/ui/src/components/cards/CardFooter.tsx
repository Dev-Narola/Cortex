/**
 * CardFooter — the bottom action row of a card.
 *
 * Sits at the bottom of the card. By default lays out actions
 * (buttons) to the right with a top border separator. Use the
 * `justify` prop to push actions to the start (e.g. a single
 * full-width button) or center.
 *
 * **Used by.** Document card (open / delete actions), billing
 * plan card (select plan button), API key card (rotate / revoke).
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

export type CardFooterJustify = "start" | "center" | "end" | "between"

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  /** Default `end`. Where the action buttons sit on the row. */
  justify?: CardFooterJustify
}

const JUSTIFY = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
} as const

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, justify = "end", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "mt-4 flex items-center gap-2 border-t border-border pt-4",
        JUSTIFY[justify],
        className,
      )}
      {...props}
    />
  ),
)
CardFooter.displayName = "CardFooter"

export { CardFooter }
