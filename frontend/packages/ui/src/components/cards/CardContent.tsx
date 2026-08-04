/**
 * CardContent — the main body of a card.
 *
 * Sits between `<CardHeader>` and `<CardFooter>`. No default
 * padding; the parent `Card` owns the outer padding. This lets
 * the content fill the full surface when `Card` is `padding="none"`.
 *
 * **Used by.** Document card body (text preview), agent card
 * (status + metadata), settings panel (form fields).
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("pt-4", className)} {...props} />,
)
CardContent.displayName = "CardContent"

export { CardContent }
