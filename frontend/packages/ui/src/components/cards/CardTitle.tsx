/**
 * CardTitle — the primary heading of a card.
 *
 * Renders as an `<h3>` by default; pass `asChild` to render
 * a different element (the parent card typically already
 * has a heading). Stays a heading for the document outline —
 * card titles are the most common H3 in the app.
 *
 * **Font.** Always `font-display` (Bricolage Grotesque) so
 * the card title reads as the most prominent element in the
 * card.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("font-display text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
)
CardTitle.displayName = "CardTitle"

export { CardTitle }
