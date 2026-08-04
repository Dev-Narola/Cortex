/**
 * CardHeader — top of a card.
 *
 * **F1 Part 3 (Task 21).** Sits at the top of the Card
 * surface. Typically holds a `<CardTitle>` and a
 * `<CardDescription>`, but accepts any children so a card
 * with a custom layout (e.g. an avatar + status pill row)
 * can compose freely.
 *
 * **Padding.** Defaults to `pb-0` so the header sits flush
 * against the body; pass `p={6}` (or any spacing utility)
 * to override.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 pb-0", className)} {...props} />
  ),
)
CardHeader.displayName = "CardHeader"

export { CardHeader }
