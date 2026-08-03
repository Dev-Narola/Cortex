/**
 * Text — semantic body copy primitive.
 *
 * **F1 scope (Task 8).** Renders as `<p>` by default; switch to
 * `<span>` via the `as` prop for inline copy. The `tone` axis
 * covers the three body-voice treatments called out in the
 * design system: default (primary), muted (secondary), and
 * inverse (on dark surfaces).
 *
 * **Use everywhere instead of `<p className="text-sm
 * text-muted-foreground">`.** Keeps the type hierarchy
 * centralised and lets the design system change one place.
 */

import { type VariantProps, cva } from "class-variance-authority"
import { type HTMLAttributes, createElement, forwardRef } from "react"

import { cn } from "../utils/cn"

const textVariants = cva("font-sans text-foreground", {
  variants: {
    size: {
      xs: "text-xs",
      sm: "text-sm",
      md: "text-base",
      lg: "text-lg",
      xl: "text-xl",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      inverse: "text-paper-50",
      accent: "text-ember-600",
      success: "text-success",
      warning: "text-warning",
      destructive: "text-destructive",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
  },
  defaultVariants: {
    size: "md",
    tone: "default",
    weight: "normal",
  },
})

export type TextElement = "p" | "span" | "div" | "label" | "li" | "dd"

export interface TextProps
  extends Omit<HTMLAttributes<HTMLElement>, "children">,
    VariantProps<typeof textVariants> {
  /** The HTML element to render. Defaults to `p`. */
  as?: TextElement
  children?: React.ReactNode
}

const Text = forwardRef<HTMLElement, TextProps>(
  ({ className, size, tone, weight, as = "p", children, ...props }, ref) =>
    createElement(as ?? "p", {
      ref,
      className: cn(textVariants({ size, tone, weight, className })),
      ...props,
      children,
    }),
)
Text.displayName = "Text"

export { Text, textVariants }
