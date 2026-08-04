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
    "data-[state=checked]:bg-ink-900 data-[state=checked]:text-paper-50 data-[state=checked]:border-ink-900",
    "data-[state=indeterminate]:bg-ink-900 data-[state=indeterminate]:text-paper-50 data-[state=indeterminate]:border-ink-900",
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
