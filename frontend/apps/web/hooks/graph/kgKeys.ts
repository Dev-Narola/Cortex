/**
 * KG query keys — the single source of truth.
 *
 * **F6 Part 2 (Task 23).** The spec is explicit:
 * use stable TanStack Query keys so cache
 * invalidation and entity-specific state stay
 * tractable. A flat ``["kg"]`` would make
 * selective invalidation impossible.
 *
 * **The pattern.**
 *   - ``kgKeys.all``             → every KG query
 *   - ``kgKeys.entities()``      → every entity query
 *   - ``kgKeys.entity(id)``      → one entity
 *   - ``kgKeys.relations(id)``   → relations for an entity
 *   - ``kgKeys.neighbors(id)``   → neighbors for an entity
 *   - ``kgKeys.search(q)``       → search result
 *   - ``kgKeys.path(s, t)``      → shortest path
 *
 * The search + path keys are scoped by their
 * inputs (the query string, the source/target
 * pair) so different searches don't share a
 * cache entry.
 */

export const kgKeys = {
  all: ["kg"] as const,
  entities: () => [...kgKeys.all, "entities"] as const,
  entity: (id: string) => [...kgKeys.entities(), id] as const,
  relations: (id: string) => [...kgKeys.all, "relations", id] as const,
  neighbors: (id: string) => [...kgKeys.all, "neighbors", id] as const,
  search: (query: string) => [...kgKeys.all, "search", query] as const,
  path: (source: string, target: string) =>
    [...kgKeys.all, "path", source, target] as const,
}
