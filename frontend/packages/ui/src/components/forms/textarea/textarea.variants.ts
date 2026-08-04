/**
 * Textarea variants — the `cva` config for the multi-line
 * field surface.
 *
 * Visually matches `input.variants.ts` so an Input and a
 * Textarea in the same form look like one design.
 */

import { type VariantProps, cva } from "class-variance-authority"

export const textareaVariants = cva(
  [
    "flex w-full items-start gap-2 rounded-md border bg-background px-3 py-2 text-sm text-foreground",
    "transition-colors placeholder:text-muted-foreground",
    "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-within:ring-destructive",
  ].join(" "),
  {
    variants: {
      state: {
        default: "border-input",
        error: "border-destructive focus-within:ring-destructive",
        success: "border-success focus-within:ring-success",
      },
      resize: {
        none: "resize-none",
        vertical: "resize-y",
        horizontal: "resize-x",
        both: "resize",
      },
    },
    defaultVariants: {
      state: "default",
      resize: "vertical",
    },
  },
)

export type TextareaVariantProps = VariantProps<typeof textareaVariants>
