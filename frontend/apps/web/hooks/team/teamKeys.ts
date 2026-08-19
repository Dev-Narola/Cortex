/**
 * Team query keys — the single source of truth.
 *
 * **F7 Part 1 (Task 23).** Same pattern as F6's
 * `kgKeys` (graph), F5's `chatKeys` (conversations),
 * and F3's `documentsKeys` (documents). Hierarchical
 * keys so `invalidate(teamKeys.all)` is the
 * one-call refresh for the whole Team tab.
 *
 * **The pattern.**
 *   - `teamKeys.all`              → every Team query
 *   - `teamKeys.members()``       → the member list
 *
 * The list key is intentionally a *factory* so a
 * future "list with filter" (Part 2+) can extend
 * the signature without breaking invalidations.
 */
export const teamKeys = {
  all: ["team"] as const,
  members: (params?: { limit?: number; offset?: number }) =>
    [...teamKeys.all, "members", params ?? {}] as const,
}
