/**
 * Input variants — the `cva` config for the field surface.
 *
 * **F1 scope (Task 12).** Extracted to its own file so the
 * design system reviewer can scan every size / state / shape
 * in one place.
 *
 * **Variants.** `state` covers the validation states
 * (default / error / success). `size` is the height ladder.
 *
 * **Theme integration.** Every border + ring colour comes
 * from a token — `border-input` (default), `border-destructive`
 * (error), `border-success` (success). No hard-coded
 * `border-red-500` or similar.
 */

import { type VariantProps, cva } from "class-variance-authority"

export const inputVariants = cva(
  [
    // Base surface
    "flex w-full items-center gap-2 rounded-md border bg-background px-3 text-sm text-foreground",
    "transition-colors placeholder:text-muted-foreground",
    "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-within:ring-destructive",
    "data-[readonly]:bg-muted/40",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-8 text-xs",
        md: "h-10",
        lg: "h-11 text-base",
      },
      state: {
        default: "border-input",
        error: "border-destructive focus-within:ring-destructive",
        success: "border-success focus-within:ring-success",
      },
    },
    defaultVariants: {
      size: "md",
      state: "default",
    },
  },
)

export type InputVariantProps = VariantProps<typeof inputVariants>
