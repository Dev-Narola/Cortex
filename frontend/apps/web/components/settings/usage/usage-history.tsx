/**
 * UsageHistory — the recent-events table.
 *
 * **F7 Part 4 (Task 13).** One row per
 * usage event returned by
 * `GET /tenants/me/usage/events`. The
 * backend returns the array newest-first
 * (per the route's docstring); the UI
 * preserves that order.
 *
 * **No client-side pagination.** The
 * per-tenant endpoint returns a flat
 * array with a `limit` filter (default
 * 50). The spec is explicit: "Do not
 * implement fake client-side pagination
 * over an incomplete dataset." When the
 * spec or future product work requires
 * pagination, the admin route
 * (`/usage/events`, owner/admin only) is
 * the path — we use the keyset cursor
 * pattern there.
 *
 * **Display rules (per the F7 Part 4 spec).**
 *   - DO display: `event_type`, `units`,
 *     `cost_usd`, `created_at`.
 *   - DO NOT display: `tenant_id` (the user
 *     is already in their tenant context).
 *   - `provider` + `model` are nice-to-have
 *     (e.g. "openai / gpt-4"); the UI
 *     surfaces them in a small subtitle
 *     when present.
 *
 * **Empty state.** When the tenant has
 * events for the period breakdown but no
 * recent events (e.g. a long-stale tenant
 * with old data), we show the standard
 * "No recent events" copy — not an error.
 */
"use client"

import { Card, CardContent, ErrorState, Skeleton, Table, TableBody, TableCell, TableHeader, TableRow } from "@cortex/ui"

import { useTenantUsageEvents } from "@/hooks/usage"
import { formatUsd } from "@/lib/utils/format"

import { eventTypeLabel, type UsageEvent } from "@/services/usage"

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatUnits(value: number, unitType: string): string {
  if (!Number.isFinite(value)) return "—"
  // The unit_type is a backend enum string;
  // we display it as a suffix when it's
  // meaningful (tokens / candidates /
  // units). The breakdown component
  // handles the per-event-type specific
  // labels.
  const formatted = value.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  })
  if (
    unitType === "tokens" ||
    unitType === "candidates" ||
    unitType === "units"
  ) {
    return `${formatted} ${unitType}`
  }
  return formatted
}

export function UsageHistorySection() {
  const { data, isLoading, isError, error, refetch } = useTenantUsageEvents({
    limit: 50,
  })

  if (isLoading) return <UsageHistorySkeleton />

  if (isError) {
    return (
      <ErrorState
        title="Unable to load usage history."
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

  const events = data ?? []

  if (events.length === 0) {
    return (
      <Card data-testid="usage-history-empty">
        <CardContent className="space-y-2 p-4 sm:p-6 text-center">
          <p className="text-sm font-medium text-paper-50">No recent events</p>
          <p className="text-sm text-paper-200/70">
            Once Cortex records a billable event, it will appear here within seconds.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card data-testid="usage-history">
      <CardContent className="space-y-3 p-4 sm:p-6">
        <h3 className="font-display text-sm font-semibold tracking-tight">
          Usage history
        </h3>
        <p className="text-xs text-paper-200/60">
          Newest first. Showing the most recent {events.length} events for the
          current period.
        </p>
        <Table data-testid="usage-history-table">
          <TableHeader>
            <TableRow>
              <TableCell tag="th">Date</TableCell>
              <TableCell tag="th">Type</TableCell>
              <TableCell tag="th">Units</TableCell>
              <TableCell tag="th" align="right">
                Cost
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <UsageEventRow key={event.id} event={event} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function UsageEventRow({ event }: { event: UsageEvent }) {
  // The provider / model metadata is a
  // nice-to-have. We render it as a
  // subtitle under the event-type label
  // when present, so the user can spot a
  // billing spike from a specific
  // provider/model at a glance.
  const providerModel = [event.provider, event.model]
    .filter(Boolean)
    .join(" · ")

  return (
    <TableRow data-testid={`usage-history-row-${event.id}`}>
      <TableCell className="text-xs text-paper-200/70">
        {formatDate(event.created_at)}
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-paper-50">
            {eventTypeLabel(event.event_type)}
          </span>
          {providerModel ? (
            <span className="text-[10px] uppercase tracking-wider text-paper-200/50">
              {providerModel}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-paper-200/70">
        {formatUnits(event.units, event.unit_type)}
      </TableCell>
      <TableCell
        align="right"
        className="font-mono text-xs text-paper-50"
        data-testid={`usage-history-cost-${event.id}`}
      >
        {formatUsd(event.cost_usd)}
      </TableCell>
    </TableRow>
  )
}

function UsageHistorySkeleton() {
  return (
    <output
      data-testid="usage-history-skeleton"
      aria-label="Loading usage history"
      className="block"
    >
      <Skeleton className="h-48 w-full" />
    </output>
  )
}
