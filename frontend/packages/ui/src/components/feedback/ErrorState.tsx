/**
 * ErrorState — "something went wrong" surface.
 *
 * **F1 Part 3 (Task 30).** Centered, generous padding, an
 * icon + title + description + optional retry button +
 * optional error code badge.
 *
 * **No feature-specific wording.** The component is
 * presentation-only; the call site passes the title and
 * description that match its context (e.g. "Couldn't load
 * documents" + "Check your connection and try again").
 *
 * **Error code.** When `code` is set (e.g. `404`, `500`,
 * `NETWORK_ERROR`), it's shown as a small badge in the
 * top-right corner — useful for support workflows where
 * the user needs to share the code.
 *
 * **Used by.** Network failures, permissions errors, 404,
 * 500, any error boundary fallback.
 */

import { AlertTriangle } from "lucide-react"
import type { HTMLAttributes } from "react"

import { cn } from "../../utils/cn"
import { Button } from "../buttons/Button"

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Headline. */
  title?: string
  /** Supporting text under the title. */
  description?: string
  /** Retry button label. */
  retryLabel?: string
  onRetry?: () => void
  /** Error code displayed as a small badge. */
  code?: string
  /** Custom icon node. Defaults to a warning triangle. */
  icon?: React.ReactNode
}

const ErrorState = ({
  className,
  title = "Something went wrong",
  description,
  retryLabel = "Try again",
  onRetry,
  code,
  icon,
  ...props
}: ErrorStateProps) => (
  <div
    role="alert"
    className={cn(
      "relative flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
      className,
    )}
    {...props}
  >
    {code ? (
      <span className="absolute right-3 top-3 rounded-md border border-destructive/30 bg-background px-2 py-0.5 font-mono text-[10px] font-medium text-destructive">
        {code}
      </span>
    ) : null}
    <div
      aria-hidden
      className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
    >
      {icon ?? <AlertTriangle className="h-6 w-6" />}
    </div>
    <div className="space-y-1">
      <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      {description ? (
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
    {onRetry ? (
      <Button onClick={onRetry} variant="outline" size="sm" className="mt-2">
        {retryLabel}
      </Button>
    ) : null}
  </div>
)
ErrorState.displayName = "ErrorState"

export { ErrorState }
