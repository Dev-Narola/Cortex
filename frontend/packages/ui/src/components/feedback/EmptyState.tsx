/**
 * EmptyState — "there's nothing here yet" surface.
 *
 * **F1 Part 3 (Task 30).** Centered, generous padding, an
 * icon + title + description + optional action button.
 *
 * **No feature-specific wording.** The component is
 * presentation-only; the call site passes the title and
 * description that match its context (e.g. "No documents
 * yet" + "Upload a PDF to get started").
 *
 * **Used by.** No Documents, No Conversations, No Agents,
 * No Search Results, and any other zero-data surface.
 */

import type { HTMLAttributes } from "react"

import { Icon, type IconName } from "../../icons/Icon"
import { cn } from "../../utils/cn"
import { Button } from "../buttons/Button"

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Lucide icon name. Default `Inbox`. */
  icon?: IconName
  /** Headline. */
  title: string
  /** Supporting text under the title. */
  description?: string
  /** Primary action button label. */
  actionLabel?: string
  /** Click handler for the action button. */
  onAction?: () => void
  /** Secondary action (e.g. "Learn more" link). */
  secondaryLabel?: string
  onSecondaryAction?: () => void
}

const EmptyState = ({
  className,
  icon = "Inbox",
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
  ...props
}: EmptyStateProps) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center",
      className,
    )}
    {...props}
  >
    <div
      aria-hidden
      className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
    >
      <Icon name={icon} size="lg" />
    </div>
    <div className="space-y-1">
      <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      {description ? (
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
    {actionLabel || secondaryLabel ? (
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {actionLabel ? (
          <Button onClick={onAction} variant="default" size="sm">
            {actionLabel}
          </Button>
        ) : null}
        {secondaryLabel ? (
          <Button onClick={onSecondaryAction} variant="ghost" size="sm">
            {secondaryLabel}
          </Button>
        ) : null}
      </div>
    ) : null}
  </div>
)
EmptyState.displayName = "EmptyState"

export { EmptyState }
