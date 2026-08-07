/**
 * WebSocket event parser — turns raw text into
 * a typed `IngestionEvent`.
 *
 * **F3 Part 4 (Task 35).** The parser is the
 * single boundary between "the network is
 * sending us arbitrary bytes" and "the rest of
 * the app has a typed event". It does the
 * minimum work to be safe:
 *
 *   1. JSON.parse (catches malformed JSON).
 *   2. Type guard on the discriminator.
 *   3. Field-level validation (document_id is
 *      a non-empty string; status is in the
 *      canonical enum; timestamp is a number
 *      if present).
 *
 * **What it deliberately does NOT do.**
 *   - Throws on invalid input. Every failure
 *     returns `null`; the caller logs + ignores.
 *   - Side effects. The parser is pure; the
 *     service / hook layer applies the parsed
 *     event to the cache.
 *   - Any UI work. The hook layer owns that.
 *
 * **Out-of-order events.** Parsing does not
 * enforce "newer than current" — the cache
 * patcher (`applyStatusToCache`) does that via
 * `shouldApplyStatus`. The parser's job is to
 * return a valid event or `null`.
 */

import {
  isDocumentStatus,
  type DocumentStatus,
} from "@/lib/documents/status"
import type { IngestionEvent } from "@/types/websocket"

/** A trivial UUID-shape check. The backend
 *  emits UUIDs; we don't need a strict regex
 *  (the backend's `_verify_ingestion_auth`
 *  already enforced the schema). A non-empty
 *  string is enough. */
function isDocumentId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function parseIngestionStatus(input: unknown): IngestionEvent | null {
  if (!input || typeof input !== "object") return null
  const candidate = input as Record<string, unknown>

  if (candidate.type !== "ingestion.status") return null
  if (!isDocumentId(candidate.document_id)) return null
  if (!isDocumentStatus(candidate.status)) return null

  const timestamp =
    typeof candidate.timestamp === "number" &&
    Number.isFinite(candidate.timestamp)
      ? candidate.timestamp
      : undefined

  return {
    type: "ingestion.status",
    document_id: candidate.document_id,
    status: candidate.status as DocumentStatus,
    timestamp,
  }
}

function parseIngestionDetail(input: unknown): IngestionEvent | null {
  if (!input || typeof input !== "object") return null
  const candidate = input as Record<string, unknown>

  if (candidate.type !== "ingestion.detail") return null
  if (!isDocumentId(candidate.document_id)) return null
  if (!candidate.detail || typeof candidate.detail !== "object") return null

  const rawDetail = candidate.detail as Record<string, unknown>
  const detail: { chunk_count?: number; embedding_count?: number; file_size?: number } = {}
  if (typeof rawDetail.chunk_count === "number") {
    detail.chunk_count = rawDetail.chunk_count
  }
  if (typeof rawDetail.embedding_count === "number") {
    detail.embedding_count = rawDetail.embedding_count
  }
  if (typeof rawDetail.file_size === "number") {
    detail.file_size = rawDetail.file_size
  }

  return {
    type: "ingestion.detail",
    document_id: candidate.document_id,
    detail,
  }
}

/**
 * Parse a raw WebSocket frame into a typed
 * ingestion event. Returns `null` for any
 * malformed input — the caller should
 * `console.warn` and move on (Task 48).
 */
export function parseIngestionEvent(data: string): IngestionEvent | null {
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    return null
  }
  // Try each known event type. We could read
  // the discriminator first and dispatch, but
  // for two event types the overhead is
  // negligible and this is easier to extend.
  return parseIngestionStatus(raw) ?? parseIngestionDetail(raw)
}
