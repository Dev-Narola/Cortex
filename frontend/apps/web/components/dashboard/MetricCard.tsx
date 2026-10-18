/**
 * MetricCard — one number from the backend, with its label and context.
 *
 * Shows a skeleton while loading and an explicit "Unavailable" when the
 * request failed: never a made-up value or a silent zero.
 */

import Link from "next/link"
import type { ReactNode } from "react"

import { Card, Icon, type IconName, Skeleton } from "@cortex/ui"

const TONE = {
  brand: "bg-brand/10 text-brand",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  ai: "bg-ai/10 text-ai",
} as const

export interface MetricCardProps {
  label: string
  icon: IconName
  value: ReactNode
  hint?: ReactNode
  loading?: boolean
  error?: boolean
  tone?: keyof typeof TONE
  href?: string
}

export function MetricCard({
  label,
  icon,
  value,
  hint,
  loading = false,
  error = false,
  tone = "brand",
  href,
}: MetricCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${TONE[tone]}`}
          aria-hidden
        >
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 min-h-9" aria-live="polite">
        {loading ? (
          <Skeleton size="h-8 w-20" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">Unavailable</p>
        ) : (
          <p className="tabular font-display text-3xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        )}
      </div>
      {hint && !loading && !error ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
    </>
  )

  if (href) {
    return (
      <Link
        href={href as never}
        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card variant="interactive" radius="xl" className="h-full">
          {body}
        </Card>
      </Link>
    )
  }
  return (
    <Card variant="glass" radius="xl">
      {body}
    </Card>
  )
}
