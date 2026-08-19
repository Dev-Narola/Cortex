/**
 * UsagePanel — the Settings → Usage & Billing
 * screen.
 *
 * **F7 Part 4.** The composition root for the
 * Usage tab. It owns:
 *   - The page header (title + subtitle).
 *   - The "Current period" context (the
 *     backend defaults to the current
 *     calendar month; we render that as
 *     static context — per the F7 Part 4
 *     spec, "Do not build a fake date
 *     selector" since the endpoint doesn't
 *     support arbitrary period selection
 *     in the per-tenant path).
 *   - The summary section (4 stat cards).
 *   - The breakdown section (per-event-type
 *     list).
 *   - The history section (recent events
 *     table).
 *
 * **Three TanStack queries.** The panel
 * intentionally drives three separate
 * queries (summary, aggregate, events) so
 * the cache lifecycle is independent — the
 * future "select a different period" UI
 * can invalidate just the keys it needs.
 *
 * **No "Documents indexed" / "Rate-limit"
 * cards.** The spec lists these as the other
 * two summary cards, but the backend's
 * summary endpoint doesn't expose them. We
 * omit the cards rather than fake numbers
 * (per the F7 Part 4 spec: "Do not use
 * $0.00 / 12,400 tokens / 75% usage as
 * hardcoded demo values"). The PR flags the
 * gap.
 */
"use client"

import { useTenantUsageSummary } from "@/hooks/usage"

import { UsageBreakdownSection } from "./usage-breakdown"
import { UsageHistorySection } from "./usage-history"
import { UsageSummarySection } from "./usage-summary"

export function UsagePanel() {
  // The period context is rendered from the
  // summary response (the backend returns
  // `period: { from, to }` on every call).
  // We pull the raw query here so the
  // heading can show "Current period"
  // without each section re-fetching.
  const summary = useTenantUsageSummary()

  return (
    <div
      className="space-y-6"
      data-testid="usage-panel"
      aria-label="Usage and billing"
    >
      <header className="space-y-1">
        <h2 className="font-display text-base font-semibold tracking-tight">
          Usage &amp; Billing
        </h2>
        <p className="text-sm text-paper-200/70">
          Track your workspace usage, estimated cost, and current limits.
        </p>
        <p
          className="text-xs text-paper-200/50"
          data-testid="usage-period-context"
        >
          {summary.data
            ? `Current period: ${formatPeriodLabel(summary.data.period.from, summary.data.period.to)}`
            : "Current period: loading…"}
        </p>
      </header>

      <UsageSummarySection />
      <UsageBreakdownSection />
      <UsageHistorySection />
    </div>
  )
}

function formatPeriodLabel(from: string, to: string): string {
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
