/**
 * Button — the foundation of every interactive surface.
 *
 * **F1 scope (Task 5/7).** Variant ladder matches shadcn/ui
 * defaults; the `spark` variant is the brand-gradient call-to-action
 * reserved for the hero and the empty-state primary actions.
 *
 * **Theme integration.** Every colour comes from a CSS variable
 * (`--ink-900`, `--paper-50`, etc.) — never `text-white` /
 * `bg-black` — so the component is theme-agnostic out of the box.
 *
 * **Variant API.** `variant` × `size` × `asChild`. Never add
 * `if (primary)` / `if (danger)` branches in the component body —
 * add a variant to the `cva` config instead.
 */

import { Slot } from "@radix-ui/react-slot"
import { type VariantProps, cva } from "class-variance-authority"
import { type ButtonHTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink-900 text-paper-50 hover:bg-ink-800",
        destructive: "bg-destructive text-paper-50 hover:opacity-90",
        outline: "border border-border bg-background hover:bg-muted hover:text-foreground",
        secondary: "bg-muted text-foreground hover:bg-cloud-200",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-ember-600 underline-offset-4 hover:underline",
        spark: "bg-spark text-paper-50 shadow-ember-500/20 shadow-lg hover:opacity-95",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-6 text-base",
        xl: "h-12 rounded-md px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as a child element (Next.js Link, etc.) while keeping button styles. */
  asChild?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
