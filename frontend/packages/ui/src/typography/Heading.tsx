/**
 * Heading — semantic, font-display-aware title.
 *
 * **F1 scope (Task 8).** Removes repeated `font-display text-N xl
 * font-semibold` patterns from screens. The `level` prop picks
 * the semantic HTML element (`h1`–`h6`); the `size` prop picks
 * the visual size — they can differ (a page might use `<h1
 * size="sm">` to keep a section heading small visually while
 * preserving the document outline).
 *
 * **Defaults:** `level="h2"` + `size="md"`. That's the safest
 * default for in-content headings; the page title on every
 * screen explicitly opts in to `level="h1" size="xl"`.
 */

import { type VariantProps, cva } from "class-variance-authority"
import { type HTMLAttributes, createElement, forwardRef } from "react"

import { cn } from "../utils/cn"

const headingVariants = cva("font-display font-semibold tracking-tight text-foreground", {
  variants: {
    size: {
      xs: "text-base",
      sm: "text-lg",
      md: "text-xl",
      lg: "text-2xl",
      xl: "text-3xl",
      "2xl": "text-4xl",
      "3xl": "text-5xl",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      inverse: "text-paper-50",
    },
  },
  defaultVariants: {
    size: "md",
    tone: "default",
  },
})

export type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6"

export interface HeadingProps
  extends Omit<HTMLAttributes<HTMLHeadingElement>, "children">,
    VariantProps<typeof headingVariants> {
  /** Semantic HTML element. Defaults to `h2`. */
  level?: HeadingLevel
  children: React.ReactNode
}

const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, size, tone, level = "h2", children, ...props }, ref) =>
    createElement(level, {
      ref,
      className: cn(headingVariants({ size, tone, className })),
      ...props,
      children,
    }),
)
Heading.displayName = "Heading"

export { Heading, headingVariants }
