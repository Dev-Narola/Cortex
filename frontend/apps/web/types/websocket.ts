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

// ---------------------------------------------------------------------------
// Conversation channel (F4 Part 2, Tasks 17 + 18)
// ---------------------------------------------------------------------------

/**
 * A retrieval-grounded citation. Mirrors the
 * backend `CitationSchema` exactly. Part 2
 * parses + stores citations; the actual UI
 * (chips + side panel) is Part 3.
 */
export interface ConversationCitation {
  documentId: string
  chunkId: string
  documentTitle: string
  chunkIndex: number
  score: number
  excerpt?: string
}

/**
 * Emitted once when the assistant turn
 * begins. Carries the assistant message id
 * the server will persist when streaming
 * completes.
 */
export interface ConversationMessageStartEvent {
  type: "message_start"
  messageId: string
}

/**
 * One streamed token. `content` is a single
 * chunk (NOT cumulative) — the frontend
 * appends to the in-flight message.
 */
export interface ConversationTokenEvent {
  type: "token"
  content: string
}

/**
 * A retrieval-grounded citation the assistant
 * is using. Emitted in numerical order ([1],
 * [2], …) so the client can render inline
 * markers that point at the right citation.
 * Part 2 stores them; Part 3 surfaces them.
 */
export interface ConversationCitationEvent {
  type: "citation"
  citation: ConversationCitation
}

/**
 * End of an assistant turn. The server has
 * persisted the message by the time the
 * client receives this event.
 */
export interface ConversationMessageCompleteEvent {
  type: "message_complete"
  messageId: string
}

/**
 * A turn-level error. The server either
 * refused the message (e.g. invalid JSON)
 * or generation failed mid-stream.
 */
export interface ConversationErrorEvent {
  type: "error"
  /** Short machine code (e.g. `GENERATION_FAILED`,
   *  `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`). */
  code: string
  /** Optional human-readable detail. */
  message?: string
}

/**
 * Discriminated union of every envelope the
 * V3 conversation channel can emit. The
 * parser is the single boundary that decides
 * whether a raw frame is one of these.
 */
export type ConversationEvent =
  | ConversationMessageStartEvent
  | ConversationTokenEvent
  | ConversationCitationEvent
  | ConversationMessageCompleteEvent
  | ConversationErrorEvent
