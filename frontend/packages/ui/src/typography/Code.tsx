/**
 * Code — inline + block code primitive.
 *
 * **F1 scope (Task 8).** Inline by default (`<code>`); switch
 * to `<pre>` via the `block` prop for multi-line snippets.
 *
 * **Styling.** Inherits the design system's `--font-mono`
 * (JetBrains Mono) and a subtle background so it stands out
 * from body copy without screaming. Use `tone="muted"` for
 * helper text that happens to be in a monospace font.
 */

import { type VariantProps, cva } from "class-variance-authority"
import { type ElementType, type HTMLAttributes, createElement, forwardRef } from "react"

import { cn } from "../utils/cn"

const codeVariants = cva(
  "font-mono text-sm text-foreground rounded-md border border-border bg-muted px-1.5 py-0.5",
  {
    variants: {
      tone: {
        default: "text-foreground bg-muted",
        muted: "text-muted-foreground bg-muted/60",
        accent: "text-ember-600 bg-ember-100/30",
      },
      block: {
        true: "block whitespace-pre overflow-x-auto p-4 text-sm",
        false: "inline",
      },
    },
    defaultVariants: {
      tone: "default",
      block: false,
    },
  },
)

export interface CodeProps
  extends Omit<HTMLAttributes<HTMLElement>, "children">,
    VariantProps<typeof codeVariants> {
  /** HTML element. Defaults to `code`; `block: true` switches to `pre`. */
  as?: ElementType
  children?: React.ReactNode
}

const Code = forwardRef<HTMLElement, CodeProps>(
  ({ className, tone, block, as, children, ...props }, ref) => {
    const element: ElementType = as ?? (block ? "pre" : "code")
    return createElement(element, {
      ref,
      className: cn(codeVariants({ tone, block, className })),
      ...props,
      children,
    })
  },
)
Code.displayName = "Code"

export { Code, codeVariants }
