/**
 * Cards — barrel for the Card surface + compound parts.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * **F1 Part 3 (Task 21).** Compound API: pair `<Card>` with
 * `<CardHeader>`, `<CardTitle>`, `<CardDescription>`,
 * `<CardContent>`, and `<CardFooter>` to compose any card layout
 * used by Dashboard, Documents, Agents, Search Results, Settings,
 * and Billing.
 *
 * **Never** create a one-off specialised card in a feature folder —
 * extend the `card.variants.ts` config instead.
 */

export { Card, type CardProps } from "./Card"
export {
  cardVariants,
  type CardVariantProps,
} from "./card.variants"
export { CardHeader } from "./CardHeader"
export { CardTitle } from "./CardTitle"
export { CardDescription } from "./CardDescription"
export { CardContent } from "./CardContent"
export {
  CardFooter,
  type CardFooterJustify,
  type CardFooterProps,
} from "./CardFooter"
