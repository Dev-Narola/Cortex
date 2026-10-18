/**
 * Checkbox variants — the `cva` config for the box surface.
 *
 * The `<Checkbox>` component itself is a thin wrapper around
 * Radix's `Checkbox.Root`; the styling lives here so a future
 * contributor can scan the design system at a glance.
 */

import { type VariantProps, cva } from "class-variance-authority"

export const checkboxVariants = cva(
  [
    "peer h-4 w-4 shrink-0 rounded-sm border border-ink-300 bg-background",
    "ring-offset-background",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary",
    "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:border-primary",
    "transition-colors",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-3.5 w-3.5",
        md: "h-4 w-4",
        lg: "h-5 w-5",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
)

export type CheckboxVariantProps = VariantProps<typeof checkboxVariants>
