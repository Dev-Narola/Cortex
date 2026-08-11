/**
 * Conversation query keys — the single source of truth.
 *
 * **F5 Part 1 (Task 6).** All TanStack Query keys
 * for conversation data live here so every
 * caller (list, detail, future rename / delete
 * / archive) can invalidate the right slice.
 *
 * **The pattern.**
 *   - `conversationsKeys.all`         → the entire namespace
 *   - `conversationsKeys.lists()`     → every list query
 *   - `conversationsKeys.list(params)` → one specific list query
 *   - `conversationsKeys.details()`   → every detail query
 *   - `conversationsKeys.detail(id)`  → one specific conversation
 *
 * The detail key shape matches the existing
 * `useInvalidateConversations` namespace
 * (`["conversations", id]`) so F4's mutation
 * invalidations keep working without changes.
 *
 * **Why not a flat `["conversations"]` key for
 * everything.** TanStack Query's
 * `invalidateQueries({ queryKey: [...] })` is
 * hierarchical — invalidating `["conversations"]`
 * matches every query whose key starts with that
 * prefix. Splitting `lists()` from `details()`
 * lets Part 2 invalidate just the list when the
 * user renames a conversation, and just the
 * detail when a new message lands.
 */

export const conversationsKeys = {
  all: ["conversations"] as const,
  lists: () => [...conversationsKeys.all, "list"] as const,
  list: (params: { limit?: number; offset?: number } = {}) =>
    [...conversationsKeys.lists(), params] as const,
  details: () => [...conversationsKeys.all, "detail"] as const,
  detail: (id: string) => [...conversationsKeys.details(), id] as const,
}
