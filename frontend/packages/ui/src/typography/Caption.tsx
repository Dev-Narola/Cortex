/**
 * Caption — small, muted helper text under a field / card.
 *
 * **F1 scope (Task 8).** Renders as `<span>` by default so it
 * nests cleanly inside `<label>` / `<p>` without changing the
 * document outline. Use for:
 *   - Helper text under a form field
 *   - Timestamps / metadata under a card title
 *   - The right-aligned table cell that says "Last edited 2d ago"
 *
 * For longer helper text that needs its own line, use `<Text
 * size="xs" tone="muted" as="p" />` instead.
 */

import { type VariantProps, cva } from "class-variance-authority"
import { type ElementType, type HTMLAttributes, createElement, forwardRef } from "react"

import { cn } from "../utils/cn"

const captionVariants = cva("text-xs text-muted-foreground", {
  variants: {
    tone: {
      default: "text-muted-foreground",
      subtle: "text-ink-500",
      accent: "text-ember-600",
    },
  },
  defaultVariants: {
    tone: "default",
  },
})

export interface CaptionProps
  extends Omit<HTMLAttributes<HTMLElement>, "children">,
    VariantProps<typeof captionVariants> {
  /** HTML element. Defaults to `span`. */
  as?: ElementType
  children?: React.ReactNode
}

const Caption = forwardRef<HTMLElement, CaptionProps>(
  ({ className, tone, as, children, ...props }, ref) =>
    createElement(as ?? "span", {
      ref,
      className: cn(captionVariants({ tone, className })),
      ...props,
      children,
    }),
)
Caption.displayName = "Caption"

export { Caption, captionVariants }
