/**
 * Document status — the lifecycle enum.
 *
 * **F3 Part 4 (Task 34).** The status is the central
 * piece of state the WebSocket pushes around. A
 * strict literal union keeps the rest of the
 * codebase honest (the F1 `Badge` variants, the
 * `useIngestionStatus` cache patch, the
 * progress-line percentages).
 *
 * **Status order.** Per the spec, the canonical
 * progression is:
 *   pending → parsing → chunking → embedding → indexed
 * with `failed` as a terminal error state. The
 * `STATUS_ORDER` map below is the source of truth
 * for "is this event newer than the current UI
 * state?" — the WebSocket layer ignores stale
 * events (Task 44).
 *
 * **No `status: string` anywhere.** If a field
 * needs to be a document status, it uses this
 * union. A drift between the backend and the
 * frontend is caught at compile time + by the
 * `parseIngestionEvent` runtime guard.
 *
 * **Why not reuse `services/documents/types.ts`.**
 * This enum is also used by the WebSocket layer,
 * which lives outside `services/`. Keeping it in
 * `lib/documents/status.ts` lets both layers
 * import the single source without a circular
 * dependency.
 */

export const DOCUMENT_STATUSES = [
  "pending",
  "parsing",
  "chunking",
  "embedding",
  "indexed",
  "failed",
] as const

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

/**
 * Numeric ordering for the canonical progression.
 * `failed` is terminal but out-of-band — it
 * doesn't "advance" from indexed. A stale
 * `failed` arriving after `indexed` SHOULD still
 * be applied (a real failure), so we give it a
 * floor above the happy path.
 */
const STATUS_ORDER: Record<DocumentStatus, number> = {
  pending: 0,
  parsing: 1,
  chunking: 2,
  embedding: 3,
  indexed: 4,
  // `failed` is "above" indexed: once a document
  // has indexed, a re-ingestion failure bumps it
  // back to failed (the spec's reprocess flow
  // can produce this).
  failed: 5,
}

/**
 * Visual progress (0..100) per status. Pure UI
 * sugar — never derived from the backend.
 */
const STATUS_PROGRESS: Record<DocumentStatus, number> = {
  pending: 0,
  parsing: 25,
  chunking: 50,
  embedding: 75,
  indexed: 100,
  failed: 0,
}

export function statusOrder(s: DocumentStatus): number {
  return STATUS_ORDER[s]
}

export function statusProgress(s: DocumentStatus): number {
  return STATUS_PROGRESS[s]
}

/**
 * Should the new event replace the current status?
 * The happy path: yes, always. The stale-event
 * case: no — a `parsing` arriving after `embedding`
 * is almost certainly a duplicate / replay and
 * shouldn't move the UI backwards.
 *
 * **Special case.** `failed` is treated as
 * "stricter": once indexed, a later failed
 * DOES apply (real re-ingestion failure).
 * Once pending/parsing, a later failed applies.
 * The "don't regress" rule is: if the candidate
 * is in the happy path AND the current status is
 * later in the happy path, ignore.
 */
export function shouldApplyStatus(
  current: DocumentStatus,
  next: DocumentStatus,
): boolean {
  // Always apply `failed` — it's terminal, the
  // user needs to know.
  if (next === "failed") return true

  const currentOrder = statusOrder(current)
  const nextOrder = statusOrder(next)

  // Same order → no-op (duplicate event).
  if (nextOrder <= currentOrder) return false

  // Reject happy-path regressions from a
  // terminal-ish state. (failed has order 5
  // so this is fine — we already returned true
  // for next === "failed" above.)
  if (current === "indexed" && nextOrder < 5) return false

  return true
}

/**
 * Human-readable label for a status. The F1 Badge
 * `LABEL` map (in `DocumentStatusBadge.tsx`) is
 * the visual source of truth; this helper exists
 * for non-UI callers (tests, tooltips, ARIA
 * descriptions).
 */
const STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: "Pending",
  parsing: "Parsing",
  chunking: "Chunking",
  embedding: "Embedding",
  indexed: "Indexed",
  failed: "Failed",
}

export function statusLabel(s: DocumentStatus): string {
  return STATUS_LABEL[s]
}

/**
 * Is the status in-flight (not yet terminal)?
 * Used by the detail drawer to disable the
 * reprocess button (matches the backend's
 * "reprocess only when indexed" rule).
 */
export function isInFlight(s: DocumentStatus): boolean {
  return s === "pending" || s === "parsing" || s === "chunking" || s === "embedding"
}

/**
 * Type guard — the runtime equivalent of the
 * literal union. Used by the WebSocket event
 * parser to validate an incoming status string
 * against the canonical enum.
 */
export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return (
    typeof value === "string" &&
    (DOCUMENT_STATUSES as readonly string[]).includes(value)
  )
}
