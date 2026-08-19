/**
 * UsageSummary — the dashboard cards.
 *
 * **F7 Part 4 (Task 6).** Four stat cards
 * driven by `useTenantUsageSummary`:
 *
 *   - **Requests** — the count of request-type
 *     events. The simplest "is the system
 *     being used?" indicator.
 *   - **Tokens consumed** — the sum of
 *     `embedding_tokens` +
 *     `completion_input_tokens` +
 *     `completion_output_tokens` (all three
 *     token fields). Matches the spec's
 *     "tokens consumed" card.
 *   - **Estimated cost** — the
 *     `estimated_cost_usd` from the summary
 *     endpoint (the total cost for the
 *     period).
 *   - **Period** — the inclusive lower /
 *     exclusive upper bound of the current
 *     period. The spec doesn't list this as a
 *     card but the panel needs it as
 *     context; the backend returns it on
 *     every response.
 *
 * **What the spec wanted but the backend
 * doesn't provide.** The spec lists
 * "Documents indexed" + "Rate-limit status"
 * as the other two cards. Neither is in the
 * summary response. We omit them rather than
 * fake numbers (per the F7 Part 4 spec: "Do
 * not use $0.00 / 12,400 tokens / 75% usage as
 * hardcoded demo values").
 *
 * **High-precision cost.** The spec says
 * "$0.0042 should not silently become
 * $0.00". The F0 `formatUsd` helper rounds
 * to 2 decimals; for the cost card we want
 * the same precision the backend returns.
 * `formatUsdCost` below is a small wrapper
 * that uses up to 4 fractional digits for
 * small values, falling back to 2 for values
 * ≥ $1.
 */
"use client"

import { Card, CardContent, ErrorState, Skeleton } from "@cortex/ui"

import { useTenantUsageSummary } from "@/hooks/usage"
import { formatCompact, formatInt, formatUsd } from "@/lib/utils/format"

import type { UsageSummary as UsageSummaryData } from "@/services/usage"

/**
 * Format a USD value with sensible precision:
 * small amounts keep 4 fractional digits (so
 * a $0.0042 cost doesn't round to $0.00);
 * values ≥ $1 use 2 fractional digits. This is
 * the same "don't lose precision" rule the
 * spec calls out, adapted to the cortex UI
 * conventions.
 */
function formatUsdCost(value: number): string {
  if (!Number.isFinite(value)) return "—"
  if (value === 0) return "$0.00"
  if (Math.abs(value) < 1) {
    // Small amounts — keep precision.
    return `$${value.toFixed(4)}`
  }
  return formatUsd(value)
}

/**
 * Format the period range as a single
 * human-readable string (e.g. "Aug 1 —
 * Aug 19, 2026"). The backend returns ISO
 * strings; we parse with `new Date()` (the
 * UI is local-tz; the backend is UTC).
 */
function formatPeriod(from: string, to: string): string {
  const a = new Date(from)
  const b = new Date(to)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—"
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  return `${fmt.format(a)} — ${fmt.format(b)}`
}

function tokensConsumed(s: UsageSummaryData): number {
  return (
    (s.embedding_tokens ?? 0) +
    (s.completion_input_tokens ?? 0) +
    (s.completion_output_tokens ?? 0)
  )
}

export function UsageSummarySection() {
  const { data, isLoading, isError, error, refetch } = useTenantUsageSummary()

  if (isLoading) return <UsageSummarySkeleton />

  if (isError) {
    return (
      <ErrorState
        title="Unable to load usage data."
        description="We couldn't reach the usage service. Check your connection and try again."
        retryLabel="Retry"
        onRetry={() => {
          void refetch()
        }}
        code={
          error && "status" in error
            ? String((error as { status?: number }).status ?? "")
            : undefined
        }
      />
    )
  }

  if (!data) return <UsageSummarySkeleton />

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="usage-summary"
      aria-label="Usage summary"
    >
      <StatCard
        label="Requests"
        value={formatInt(data.requests)}
        sublabel="billable API calls"
        testId="usage-stat-requests"
      />
      <StatCard
        label="Tokens consumed"
        value={formatCompact(tokensConsumed(data))}
        sublabel="embeddings + completions"
        testId="usage-stat-tokens"
      />
      <StatCard
        label="Estimated cost"
        value={formatUsdCost(data.estimated_cost_usd)}
        sublabel="current period"
        testId="usage-stat-cost"
      />
      <StatCard
        label="Period"
        value={formatPeriod(data.period.from, data.period.to)}
        sublabel="UTC"
        testId="usage-stat-period"
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  sublabel,
  testId,
}: {
  label: string
  value: string
  sublabel?: string
  testId: string
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-paper-200/50">
          {label}
        </p>
        <p
          className="font-display text-2xl font-semibold tracking-tight text-paper-50"
          data-testid={testId}
        >
          {value}
        </p>
        {sublabel ? <p className="text-xs text-paper-200/60">{sublabel}</p> : null}
      </CardContent>
    </Card>
  )
}

function UsageSummarySkeleton() {
  return (
    <output
      data-testid="usage-summary-skeleton"
      aria-label="Loading usage summary"
      className="block"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </output>
  )
}
