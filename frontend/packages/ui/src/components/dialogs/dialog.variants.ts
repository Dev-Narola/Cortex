/**
 * Dialog variants — the `cva` config for the Dialog surface.
 *
 * **F1 Part 3 (Task 22).** Extracted to its own file so the
 * design-system reviewer can scan every size + behavior in one
 * place. The actual Radix primitive composition lives in the
 * per-component files (`DialogHeader`, `DialogContent`, etc.).
 *
 * **Sizes.** `sm | md | lg | xl | fullscreen` — mapped to max-width
 * Tailwind utilities. `fullscreen` is for media-heavy surfaces
 * (image picker, code editor) where the user wants the dialog
 * to fill the viewport.
 *
 * **Behavior.** The behavior axis is informational only — the
 * Radix primitive already supports `onEscapeKeyDown`,
 * `onPointerDownOutside`, and `onInteractOutside`. The axis
 * exists so the call site can name the intent ("destructive":
 * warn on close) without re-implementing the escape behavior.
 */

import { type VariantProps, cva } from "class-variance-authority"

export const dialogContentVariants = cva(
  "fixed left-1/2 top-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 border border-border bg-background p-6 shadow-2xl rounded-xl",
  {
    variants: {
      size: {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-lg",
        xl: "max-w-2xl",
        fullscreen:
          "max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
)

export type DialogContentVariantProps = VariantProps<typeof dialogContentVariants>
