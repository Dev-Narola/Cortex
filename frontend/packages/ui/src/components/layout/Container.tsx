/**
 * Container — a content-width cap with consistent horizontal
 * padding.
 *
 * **F1 Part 4 (Task 36).** Used for the marketing-site
 * sections (where the canvas is wider than the app's
 * max-w-7xl) and for the auth pages' centred card.
 *
 * **Sizes.** `sm | md | lg | xl | full` — maps to
 * `max-w-*` Tailwind utilities. `full` removes the cap
 * entirely (the page owns its width).
 *
 * **Padding.** Default `px-4 sm:px-6 lg:px-8`; pass
 * `narrow` to use the dense mobile pattern (px-2 sm:px-4).
 */

import { type HTMLAttributes, forwardRef } from "react"

import { cn } from "../../utils/cn"

const SIZE = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-none",
} as const

export type ContainerSize = keyof typeof SIZE

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: ContainerSize
  /** Default `wide`. `narrow` tightens the mobile padding. */
  density?: "narrow" | "wide"
}

const Container = forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size = "lg", density = "wide", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "mx-auto w-full",
        SIZE[size],
        density === "narrow" ? "px-2 sm:px-4" : "px-4 sm:px-6 lg:px-8",
        className,
      )}
      {...props}
    />
  ),
)
Container.displayName = "Container"

export { Container }
