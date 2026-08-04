/**
 * CardDescription — the subtitle / supporting text of a card.
 *
 * Renders as a `<p>` with `text-muted-foreground` so it reads as
 * secondary information under the title. Pass `asChild` to render
 * a different element (e.g. a `<div>` for a status row).
 *
 * **Theme integration.** Uses `text-muted-foreground` (token) so
 * the description reads correctly in both light and dark themes.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
)
CardDescription.displayName = "CardDescription"

export { CardDescription }
