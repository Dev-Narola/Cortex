/**
 * Card — the standard surface container.
 *
 * **F1 Part 3 (Task 21).** Per the spec, the Card system
 * lives in `components/cards/` with a file per sub-part.
 * This file owns the `Card` surface + the `card.variants.ts`
 * config; the sub-parts (`CardHeader`, `CardTitle`,
 * `CardDescription`, `CardContent`, `CardFooter`) live in
 * their own files in this folder.
 *
 * **Used by.** Dashboard metrics, document cards, agent
 * cards, search results, settings panels, billing plans.
 * Never create a one-off specialised card in a feature
 * folder — extend the variants here instead.
 *
 * **Theme integration.** Every colour comes from a token
 * (`bg-card`, `border-border`, `text-card-foreground`) so
 * the surface flips correctly between the marketing (light)
 * and authenticated app (dark) themes.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"
import { type CardVariantProps, cardVariants } from "./card.variants"

export interface CardProps extends HTMLAttributes<HTMLDivElement>, CardVariantProps {}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, radius, state, ...props }, ref) => (
    <div
      ref={ref}
      data-state={state === "default" ? undefined : state}
      className={cn(cardVariants({ variant, padding, radius, state }), className)}
      {...props}
    />
  ),
)
Card.displayName = "Card"

export { Card, cardVariants, type CardVariantProps }
