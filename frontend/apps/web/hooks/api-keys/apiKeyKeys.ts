/**
 * API Key query keys — the single source of truth.
 *
 * **F7 Part 2 (Task 5).** Same pattern as F6's
 * `kgKeys`, F7 Part 1's `teamKeys`, and F5's
 * `chatKeys`. Hierarchical keys so
 * `invalidate(apiKeyKeys.all)` refreshes the
 * panel in one call.
 *
 * **The pattern.**
 *   - `apiKeyKeys.all`               → every key query
 *   - `apiKeyKeys.list({...})`       → the active key list
 *
 * The list key is a factory so the future
 * "include revoked" toggle can extend the
 * signature without breaking invalidations.
 */
export const apiKeyKeys = {
  all: ["api-keys"] as const,
  list: (params?: { include_revoked?: boolean }) =>
    [...apiKeyKeys.all, "list", params ?? {}] as const,
}
