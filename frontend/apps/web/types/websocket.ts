/**
 * WebSocket event types — the canonical message
 * contracts the backend ingestion channel emits.
 *
 * **F3 Part 4 (Task 34).** Every event carries a
 * `type` discriminator + a `document_id` (UUID) +
 * a `status` from the ingestion lifecycle. The
 * parser (`lib/websocket/parseEvent.ts`) is the
 * single place that decides whether a raw message
 * is valid.
 *
 * **Adding events.** Append a new member to
 * `IngestionEvent`. The parser's discriminated
 * switch + TypeScript's exhaustiveness checking
 * will force the consumer to handle it.
 *
 * **Why a strict union (not `event: any`).** The
 * spec is explicit: malformed events must not
 * crash the Documents page. A typed union gives
 * us compile-time safety + a runtime guard.
 */

import type { DocumentStatus } from "@/lib/documents/status"

/**
 * Per-document status push. Emitted by the backend
 * every time the ingestion worker advances (or
 * fails) a document. The frontend applies the
 * status to the matching document in the
 * TanStack Query cache.
 */
export interface IngestionStatusEvent {
  type: "ingestion.status"
  /** Document UUID, matching `Document.id`. */
  document_id: string
  /** The new lifecycle status. */
  status: DocumentStatus
  /**
   * Optional server timestamp (epoch ms). The
   * frontend doesn't currently use this — the
   * spec defers ordering decisions to the
   * `shouldApplyStatus` rule. Kept in the
   * contract for future log-correlation.
   */
  timestamp?: number
}

/**
 * Optional: per-document terminal-event push
 * (e.g. "indexed" + a chunk count). Defined as a
 * separate type so future additions (chunks,
 * embeddings count) don't break the existing
 * `ingestion.status` listeners.
 */
export interface IngestionDetailEvent {
  type: "ingestion.detail"
  document_id: string
  /** Map of optional fields the backend wants to push. */
  detail: {
    chunk_count?: number
    embedding_count?: number
    file_size?: number
  }
}

/**
 * Discriminated union of every event the
 * ingestion channel can emit.
 */
export type IngestionEvent = IngestionStatusEvent | IngestionDetailEvent
