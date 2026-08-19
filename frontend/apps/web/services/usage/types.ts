/**
 * Usage & Billing — types.
 *
 * **F7 Part 4.** Narrow UI mapping for the
 * tenant-scoped usage data the Settings page
 * consumes.
 *
 * **Verified contract.** All shapes mirror
 * the actual backend response (verified
 * against `Cortex/src/billing/interface/rest/routes.py`
 * + `Cortex/src/billing/application/usage_service.py`).
 * We do NOT invent fields the backend doesn't
 * return (per the F7 Part 4 spec: "Follow the
 * actual response contract").
 *
 * **Three endpoints, three response types.**
 *  1. `GET /tenants/me/usage/summary` — flat
 *     dashboard shape (`UsageSummary`).
 *  2. `GET /tenants/me/usage` — aggregate
 *     (`TenantUsageAggregate`).
 *  3. `GET /tenants/me/usage/events` — raw
 *     events (`UsageEvent`).
 *
 * **What the backend does NOT provide.**
 *   - "Documents indexed" — the spec lists this
 *     as a summary card, but the backend's
 *     summary endpoint doesn't expose it.
 *     Including a "documents indexed" value
 *     would mean faking a number. We omit the
 *     card instead and flag the gap in the PR.
 *   - "Rate-limit status" — the spec lists this
 *     as a summary card, but the backend has
 *     no rate-limit endpoint. The rate-limit
 *     banner is owned by the cross-cutting
 *     `RateLimitBanner` component (F4 Part 4),
 *     not the Settings page. We omit the card.
 *   - "monthly_limit", "current_spend",
 *     "invoice_total", "billing_cycle" — the
 *     spec says "Do not invent these unless
 *     your backend actually returns them."
 *     The backend doesn't, so we don't.
 */

/**
 * The flat dashboard shape returned by
 * `GET /tenants/me/usage/summary`. Each field
 * is the sum over the requested period.
 */
export interface UsageSummary {
  /** Inclusive lower + exclusive upper bound
   *  of the period (UTC). The backend defaults
   *  this to the current calendar month. */
  period: {
    from: string
    to: string
  }
  /** Total count of REQUEST-type events. */
  requests: number
  /** Sum of input_tokens for embedding events. */
  embedding_tokens: number
  /** Sum of input_tokens for completion events. */
  completion_input_tokens: number
  /** Sum of output_tokens for completion events. */
  completion_output_tokens: number
  /** Sum of units for rerank events
   *  (candidates). */
  rerank_units: number
  /** Total cost for the period, in USD. */
  estimated_cost_usd: number
}

/**
 * The per-event-type aggregate returned by
 * `GET /tenants/me/usage`. The shape mirrors
 * the SQL `GROUP BY (event_type, unit_type)`
 * + the `total_cost_usd` rollup that the
 * backend's `aggregate_for_tenant` produces.
 *
 * Each event-type key is a backend event
 * string (`embedding`, `completion`,
 * `rerank`, `storage`, etc.). Each
 * event-type value is a per-unit-type
 * breakdown (`tokens`, `candidates`,
 * `cost_usd`).
 */
export interface TenantUsageAggregate {
  tenant_id: string
  period_start: string | null
  period_end: string | null
  total_cost_usd: number
  /** Map of `event_type → { unit_type: units }`.
   *  The `cost_usd` key is mixed in per event
   *  type (the backend's per-(event_type,
   *  unit_type) grouping includes a `cost_usd`
   *  row for each event_type). */
  by_event: Record<string, Record<string, number>>
}

/**
 * A single raw usage event, returned by
 * `GET /tenants/me/usage/events`.
 */
export interface UsageEvent {
  id: string
  event_type: string
  /** Numeric units (tokens, candidates, etc.) —
   *  the meaning depends on the
   *  (event_type, unit_type) pair. */
  units: number
  unit_type: string
  cost_usd: number
  provider: string | null
  model: string | null
  resource_id: string | null
  input_tokens: number
  output_tokens: number
  total_tokens: number
  pricing_version: string | null
  created_at: string
}

/**
 * A small enum of the unit types the backend
 * records. Used by the UI to label the
 * breakdown rows + the history table
 * accurately. The values are the
 * ``unit_type`` enum's string form.
 */
export const UNIT_TYPES = {
  TOKENS: "tokens",
  CANDIDATES: "candidates",
  /** Generic fall-through. The backend
   *  sometimes records other unit types
   *  (e.g. storage gigabyte-seconds). */
  UNITS: "units",
} as const

/**
 * A small enum of the event types the UI
 * knows how to label + summarise. Mirrors
 * the backend's `EventType` enum. The UI
 * surfaces an "Unknown" label for any event
 * type the backend adds in the future — the
 * screen must never crash on a new value.
 */
export const EVENT_TYPES = {
  EMBEDDING: "embedding",
  COMPLETION: "completion",
  RERANK: "rerank",
  STORAGE: "storage",
  /** A bookkeeping event for a request that
   *  didn't consume a billable resource
   *  (e.g. a cache hit). */
  REQUEST: "request",
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]

/**
 * Human-readable label for an event type.
 * The mapping is a presentation concern —
 * the backend's enum is stable, the UI's
 * label is whatever the product team chooses.
 */
export function eventTypeLabel(eventType: string): string {
  switch (eventType) {
    case EVENT_TYPES.EMBEDDING:
      return "Embeddings"
    case EVENT_TYPES.COMPLETION:
      return "Completions"
    case EVENT_TYPES.RERANK:
      return "Rerank"
    case EVENT_TYPES.STORAGE:
      return "Storage"
    case EVENT_TYPES.REQUEST:
      return "Requests"
    default:
      // Defensive: the backend may add new
      // event types in the future. We render
      // the raw enum value rather than crash
      // (the test suite pins this behaviour).
      return eventType
  }
}
