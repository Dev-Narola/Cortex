/**
 * Skeleton — placeholder shape for server-data loading.
 *
 * **F1 scope (Task 11 supporting).** Used everywhere a screen
 * fetches data that hasn't arrived yet. The variants cover
 * the common shapes (text line, circle avatar, rounded card)
 * so the call site is one prop away from a realistic
 * placeholder.
 *
 * **No `SkeletonText` line-count prop.** Counters (paragraphs,
 * list items) are easy enough to compose at the call site with
 * `<Skeleton variant="text" />` × N in a flex column.
 *
 * **Animation.** A subtle pulse via `animate-pulse`. The
 * `prefers-reduced-motion` query in `globals.css` (F0) suppresses
 * the animation for users who opt out.
 *
 * **Theme integration.** Uses `bg-muted` so the placeholder
 * sits on the same surface as the eventual content.
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const SKELETON_VARIANTS = {
  text: "h-3 w-full rounded",
  circle: "rounded-full",
  rect: "rounded-md",
  block: "h-24 w-full rounded-md",
} as const

export type SkeletonVariant = keyof typeof SKELETON_VARIANTS

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Default `text`. */
  variant?: SkeletonVariant
  /** Custom size override (e.g. `"h-12 w-12"`). Overrides the variant's default size. */
  size?: string
}

const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = "text", size, style, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn("animate-pulse bg-muted", SKELETON_VARIANTS[variant], size, className)}
      style={style}
      {...props}
    />
  ),
)
Skeleton.displayName = "Skeleton"

export { Skeleton }
