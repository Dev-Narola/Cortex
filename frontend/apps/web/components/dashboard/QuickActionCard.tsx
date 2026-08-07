/**
 * QuickActionCard — a single tile in the dashboard's
 * "Quick Actions" row.
 *
 * **F3 Part 1 (Task 8).** Each card is a clickable tile
 * with an icon, title, description, and (optional)
 * primary action. Most cards are "Coming Soon" in F3
 * (the spec is explicit: don't navigate to half-built
 * pages) — the only live card today is
 * "Upload Document".
 *
 * **Variants.**
 *   - `default` — live card; clickable; opens the
 *     `onAction` (or `onClick`) handler.
 *   - `coming-soon` — disabled; surfaces a subtle
 *     "Soon" pill in the corner.
 *   - `disabled` — explicitly disabled (no badge).
 *
 * **Why a `Button asChild`.** The card is rendered as
 * a button (keyboard-focusable) so the user can Tab to
 * it. The card's visual is a large tile; using
 * `asChild` lets the future versions swap the
 * underlying element (e.g. `next/link`) without
 * restructuring the visual.
 */

"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { Button, Card, CardContent, Icon, type IconName } from "@cortex/ui"

export type QuickActionVariant = "default" | "coming-soon" | "disabled"

export interface QuickActionCardProps {
  title: string
  description: string
  icon: IconName
  /** Optional primary action label. Defaults to title. */
  actionLabel?: string
  /** When set, the card becomes a link to this href. */
  href?: string
  /** When set, the card triggers this callback on click. */
  onAction?: () => void
  /** Card state. Default `default`. */
  variant?: QuickActionVariant
}

export function QuickActionCard({
  title,
  description,
  icon,
  actionLabel,
  href,
  onAction,
  variant = "default",
}: QuickActionCardProps): ReactNode {
  const isLive = variant === "default"
  const isSoon = variant === "coming-soon"

  // The trigger: a `next/link` (for href), a button
  // (for onAction), or a static card (for disabled).
  let trigger: ReactNode
  if (href && isLive) {
    trigger = (
      <Button asChild className="w-full" size="sm">
        <Link href={href as never}>{actionLabel ?? title}</Link>
      </Button>
    )
  } else if (onAction && isLive) {
    trigger = (
      <Button className="w-full" size="sm" onClick={onAction}>
        {actionLabel ?? title}
      </Button>
    )
  } else {
    trigger = (
      <Button className="w-full" size="sm" variant="outline" disabled aria-disabled>
        {actionLabel ?? title}
      </Button>
    )
  }

  return (
    <Card className={isSoon ? "opacity-70" : undefined}>
      <CardContent className="flex h-full flex-col gap-3 pt-6">
        <div className="flex items-start justify-between">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-md bg-ember-500/10 text-ember-600"
            aria-hidden
          >
            <Icon name={icon} className="h-5 w-5" />
          </span>
          {isSoon ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Soon
            </span>
          ) : null}
        </div>
        <div className="flex-1 space-y-1">
          <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {trigger}
      </CardContent>
    </Card>
  )
}
