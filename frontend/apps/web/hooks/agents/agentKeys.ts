/**
 * Agent query keys — the single source of truth.
 *
 * **F5 Part 3 (Task 11).** Every TanStack Query key
 * for agent data lives here so every caller (the
 * trace UI today, the future agent run history +
 * agent detail pages) can invalidate the right
 * slice.
 *
 * **The pattern.**
 *   - ``agentKeys.all``         → the entire namespace
 *   - ``agentKeys.runs()``      → every run query
 *   - ``agentKeys.run(id)``     → one specific run
 *   - ``agentKeys.toolCalls(id)`` → one run's flattened tool-call list
 *
 * **Why include the run id in the key.** The
 * trace UI can be open for one run, then the user
 * switches to a different conversation with a
 * different run. The query key must include the
 * run id so TanStack Query's cache does not mix
 * tool calls between runs. (Spec Task 48.)
 */

export const agentKeys = {
  all: ["agents"] as const,
  runs: () => [...agentKeys.all, "runs"] as const,
  run: (id: string) => [...agentKeys.runs(), id] as const,
  toolCalls: (id: string) =>
    [...agentKeys.runs(), id, "tool-calls"] as const,
} as const
