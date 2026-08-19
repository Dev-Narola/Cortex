/**
 * Usage query keys — the single source of truth.
 *
 * **F7 Part 4.** Same pattern as F6's
 * `kgKeys`, F7 Part 1's `teamKeys`, F7 Part 2's
 * `apiKeyKeys`. Hierarchical keys so the panel
 * can invalidate one or all in a single call.
 *
 * **The pattern.**
 *   - `usageKeys.all`               → every usage query
 *   - `usageKeys.summary({...})`    → the dashboard cards
 *   - `usageKeys.aggregate({...})`  → the per-event breakdown
 *   - `usageKeys.events({...})`     → the recent-events list
 *
 * The list keys are factories so the future
 * "select a different period" UI can extend
 * the signature without breaking invalidations.
 */
export const usageKeys = {
  all: ["usage"] as const,
  summary: (params?: { period_start?: string; period_end?: string }) =>
    [...usageKeys.all, "summary", params ?? {}] as const,
  aggregate: (params?: { period_start?: string; period_end?: string }) =>
    [...usageKeys.all, "aggregate", params ?? {}] as const,
  events: (params?: { limit?: number; event_type?: string }) =>
    [...usageKeys.all, "events", params ?? {}] as const,
}
