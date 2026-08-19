/**
 * UsageBreakdown — the per-event-type
 * breakdown section.
 *
 * **F7 Part 4 (Task 11).** One row per
 * event type returned by
 * `GET /tenants/me/usage`'s `by_event` map.
 * Each row shows:
 *   - the human-readable event-type label
 *     (e.g. "Embeddings")
 *   - the unit-type-specific count
 *     (tokens / candidates / etc.)
 *   - the per-event cost in USD
 *
 * **Unknown event types.** The backend may
 * add new event types in the future
 * (the database schema is `str`-based).
 * The UI renders the raw enum value
 * (via `eventTypeLabel`'s default branch)
 * and skips the cost display if the
 * event-type row is missing the `cost_usd`
 * key. A test pins this defensive behaviour.
 *
 * **Empty state.** When `by_event` is empty
 * (a brand-new tenant) we show the standard
 * "No usage yet" copy (Task 19) — not an
 * error state.
 */
"use client"

import { Card, CardContent, ErrorState, Skeleton } from "@cortex/ui"

import { useTenantUsage } from "@/hooks/usage"
import { formatUsd } from "@/lib/utils/format"

import {
  eventTypeLabel,
  UNIT_TYPES,
} from "@/services/usage"

const KNOWN_UNIT_KEYS: ReadonlySet<string> = new Set([
  UNIT_TYPES.TOKENS,
  UNIT_TYPES.CANDIDATES,
  UNIT_TYPES.UNITS,
])

/**
 * Format the per-event-type "main number" —
 * the most user-relevant unit for that
 * event type. Tokens for embeddings /
 * completions, candidates for rerank, units
 * as a generic fall-back. Returns null if
 * the event-type row has no recognised
 * unit key (the backend may use a custom
 * one; we just don't have a "main number"
 * for it).
 *
 * **Implementation note.** With
 * `noUncheckedIndexedAccess: true` in
 * `tsconfig.base.json`, indexed access on
 * `Record<string, number>` returns
 * `number | undefined`. We capture the
 * value in a local `const` so the narrowing
 * survives across the return expression
 * (TS won't re-narrow an indexed access
 * expression that's repeated on the RHS).
 */
function mainUnitsFor(eventTypeKey: string, units: Record<string, number>): {
  value: number
  unit: string
} | null {
  // Pick the first recognised unit key in a
  // deterministic order: tokens > candidates
  // > units. The backend may add more unit
  // types; we surface the first one we know
  // about.
  const tokens = units[UNIT_TYPES.TOKENS]
  if (typeof tokens === "number" && Number.isFinite(tokens)) {
    return { value: tokens, unit: "tokens" }
  }
  const candidates = units[UNIT_TYPES.CANDIDATES]
  if (typeof candidates === "number" && Number.isFinite(candidates)) {
    return { value: candidates, unit: "candidates" }
  }
  const genericUnits = units[UNIT_TYPES.UNITS]
  if (typeof genericUnits === "number" && Number.isFinite(genericUnits)) {
    return { value: genericUnits, unit: "units" }
  }
  // Fallback: take the first numeric key
  // that isn't `cost_usd` (which is a money
  // amount, not a count).
  for (const [k, v] of Object.entries(units)) {
    if (k === "cost_usd") continue
    if (typeof v === "number" && Number.isFinite(v)) {
      return { value: v, unit: k }
    }
  }
  // Suppress unused-var lint by referencing
  // the parameter.
  void eventTypeKey
  void KNOWN_UNIT_KEYS
  return null
}

/**
 * Sort the event-type rows in a deterministic,
 * user-friendly order. Embeddings first
 * (the most-common operation), then
 * completions, then rerank, then everything
 * else alphabetically. The order is purely
 * presentational; the backend's map is
 * unordered.
 */
const PRIORITY_ORDER: ReadonlyArray<string> = [
  "embedding",
  "completion",
  "rerank",
  "storage",
  "request",
]

function sortEventTypes(keys: ReadonlyArray<string>): string[] {
  const priority = new Map(PRIORITY_ORDER.map((k, i) => [k, i]))
  return [...keys].sort((a, b) => {
    const aRank = priority.get(a)
    const bRank = priority.get(b)
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank
    if (aRank !== undefined) return -1
    if (bRank !== undefined) return 1
    return a.localeCompare(b)
  })
}

export function UsageBreakdownSection() {
  const { data, isLoading, isError, error, refetch } = useTenantUsage()

  if (isLoading) return <UsageBreakdownSkeleton />

  if (isError) {
    return (
      <ErrorState
        title="Unable to load the usage breakdown."
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

  if (!data) return <UsageBreakdownSkeleton />

  const eventKeys = sortEventTypes(Object.keys(data.by_event))

  // Empty state — a brand-new tenant with no
  // usage yet. Same copy as the spec's "no
  // usage yet" example (Task 19).
  if (eventKeys.length === 0) {
    return (
      <EmptyBreakdown />
    )
  }

  return (
    <Card data-testid="usage-breakdown">
      <CardContent className="space-y-3 p-4 sm:p-6">
        <h3 className="font-display text-sm font-semibold tracking-tight">
          Usage breakdown
        </h3>
        <p className="text-xs text-paper-200/60">
          Per-event-type totals for the current period. Costs are the actual backend
          roll-ups — no client-side arithmetic.
        </p>
        <ul className="space-y-1.5" data-testid="usage-breakdown-list">
          {eventKeys.map((eventType) => {
            const row = data.by_event[eventType] ?? {}
            const main = mainUnitsFor(eventType, row)
            const cost = typeof row.cost_usd === "number" ? row.cost_usd : null
            return (
              <li
                key={eventType}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-700/40 bg-slate-900/30 px-3 py-2"
                data-testid={`usage-breakdown-row-${eventType}`}
              >
                <div>
                  <p
                    className="text-sm font-medium text-paper-50"
                    data-testid={`usage-breakdown-label-${eventType}`}
                  >
                    {eventTypeLabel(eventType)}
                  </p>
                  {main ? (
                    <p
                      className="text-xs text-paper-200/60"
                      data-testid={`usage-breakdown-units-${eventType}`}
                    >
                      {main.value.toLocaleString("en-US", {
                        maximumFractionDigits: 0,
                      })}{" "}
                      {main.unit}
                    </p>
                  ) : null}
                </div>
                <p
                  className="font-mono text-sm text-paper-50"
                  data-testid={`usage-breakdown-cost-${eventType}`}
                >
                  {cost === null ? "—" : formatUsd(cost)}
                </p>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function EmptyBreakdown() {
  return (
    <Card data-testid="usage-breakdown-empty">
      <CardContent className="space-y-2 p-4 sm:p-6 text-center">
        <p className="text-sm font-medium text-paper-50">No usage yet</p>
        <p className="text-sm text-paper-200/70">
          Usage will appear here once Cortex processes documents or handles AI
          requests.
        </p>
      </CardContent>
    </Card>
  )
}

function UsageBreakdownSkeleton() {
  return (
    <output
      data-testid="usage-breakdown-skeleton"
      aria-label="Loading usage breakdown"
      className="block"
    >
      <Skeleton className="h-32 w-full" />
    </output>
  )
}
