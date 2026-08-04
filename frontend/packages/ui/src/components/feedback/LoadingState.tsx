/**
 * LoadingState — generic "loading" surface.
 *
 * **F1 Part 3 (Task 30).** Centered, generous padding, a
 * spinner (or a skeleton composition) + optional text.
 *
 * **Two modes.**
 *   - `spinner` (default) — a `Spinner` + optional text.
 *     Use for short, indeterminate loads (button actions,
 *     route transitions, the empty state before data).
 *   - `skeleton` — render `children` (typically a
 *     composition of `<Skeleton>` blocks). Use for
 *     table / list placeholders that match the eventual
 *     content's shape.
 *
 * **No feature-specific wording.** The component is
 * presentation-only; the call site passes the title and
 * description that match its context.
 */

import type { HTMLAttributes, OutputHTMLAttributes, ReactNode } from "react"

import { cn } from "../../utils/cn"
import { Spinner } from "./Spinner"

export type LoadingStateMode = "spinner" | "skeleton"

export interface LoadingStateProps
  extends Omit<OutputHTMLAttributes<HTMLOutputElement>, "children"> {
  /** Default `spinner`. `skeleton` renders `children` instead. */
  mode?: LoadingStateMode
  /** Headline shown above the spinner. */
  title?: string
  /** Supporting text under the title. */
  description?: string
  /** Skeleton composition (used when `mode="skeleton"`). */
  children?: ReactNode
  /** Allow standard `aria-*` props for accessibility. */
  role?: HTMLAttributes<HTMLElement>["role"]
}

const LoadingState = ({
  className,
  mode = "spinner",
  title,
  description,
  children,
  ...props
}: LoadingStateProps) => (
  <output
    aria-live="polite"
    className={cn(
      "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center",
      className,
    )}
    {...props}
  >
    {mode === "spinner" ? (
      <>
        <Spinner size="lg" label={title ?? "Loading"} />
        {title ? (
          <h3 className="font-display text-sm font-semibold tracking-tight text-foreground">
            {title}
          </h3>
        ) : null}
        {description ? (
          <p className="mx-auto max-w-sm text-xs text-muted-foreground">{description}</p>
        ) : null}
      </>
    ) : (
      <div className="w-full">{children}</div>
    )}
  </output>
)
LoadingState.displayName = "LoadingState"

export { LoadingState }
