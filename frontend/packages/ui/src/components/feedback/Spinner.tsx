/**
 * Spinner — animated loading indicator.
 *
 * **F1 scope (Task 11 supporting).** Used inside the `Button`
 * loading state, upload progress, streaming responses, and
 * route-level loading UIs.
 *
 * **Built on `Loader2` from lucide-react** with the brand
 * `animate-spin` keyframe. The icon-only mode (`label` omitted)
 * is the default for in-button usage; pass a `label` to
 * announce the spinner to screen readers without visual text.
 *
 * **Sizes.** `sm` (12px), `md` (16px), `lg` (24px) — the same
 * scale as the rest of the design system.
 *
 * **Honours `prefers-reduced-motion`.** The `animate-spin` class
 * is suppressed globally in `globals.css` when the user opts
 * out — verified by the F0 a11y foundation.
 */

import { Loader2 } from "lucide-react"

import { cn } from "../../utils/cn"

const SIZES = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-6 w-6",
} as const

export type SpinnerSize = keyof typeof SIZES

export interface SpinnerProps {
  /** Default `md`. */
  size?: SpinnerSize
  /** Accessible label. When set, the icon gets `role="status"`. */
  label?: string
  className?: string
}

export function Spinner({ size = "md", label, className }: SpinnerProps) {
  const a11y = label
    ? ({ role: "status", "aria-label": label } as const)
    : ({ "aria-hidden": true, focusable: false } as const)
  return <Loader2 className={cn("animate-spin text-current", SIZES[size], className)} {...a11y} />
}
