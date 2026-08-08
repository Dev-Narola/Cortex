/**
 * Conversation WebSocket event parser —
 * turns a raw text frame into a typed
 * `ConversationEvent`.
 *
 * **F4 Part 2 (Task 18).** The parser is the
 * single boundary between "the network is
 * sending us arbitrary bytes" and "the rest
 * of the app has a typed event". It mirrors
 * the parser pattern from F3 Part 4
 * (`parseIngestionEvent`) and the backend's
 * V3 envelope contract exactly.
 *
 * **Backend contract.** The V3 server emits
 * the following envelopes (see
 * `src/conversation/interface/websocket/handlers.py`):
 *
 *   - `message_start`    — `{"type": "message_start", "message_id": "…"}`
 *   - `token`            — `{"type": "token", "content": "..."}`
 *   - `citation`         — `{"type": "citation", "citation": {...}}`
 *   - `message_complete` — `{"type": "message_complete", "message_id": "…"}`
 *   - `error`            — `{"type": "error", "code": "...", "message": "..."}`
 *
 * **What it deliberately does NOT do.**
 *   - Throws on invalid input. Every failure
 *     returns `null`; the caller logs + ignores.
 *     A bad frame must NEVER crash the chat.
 *   - Side effects. The parser is pure; the
 *     service / hook layer applies the parsed
 *     event to the stream store.
 *   - Reconnection. That's the
 *     `WebSocketClient`'s job; this parser
 *     just turns text into objects.
 */

import type {
  ConversationCitation,
  ConversationEvent,
} from "@/types/websocket"

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Parse a citation payload. Returns `null` if
 * any required field is missing or wrong type.
 * The backend's `CitationSchema` enforces the
 * same contract server-side.
 */
function parseCitation(input: unknown): ConversationCitation | null {
  if (!input || typeof input !== "object") return null
  const c = input as Record<string, unknown>
  if (!isNonEmptyString(c.document_id)) return null
  if (!isNonEmptyString(c.chunk_id)) return null
  if (!isNonEmptyString(c.document_title)) return null
  if (!isFiniteNumber(c.chunk_index)) return null
  const score = isFiniteNumber(c.score) ? c.score : 0
  const result: ConversationCitation = {
    documentId: c.document_id,
    chunkId: c.chunk_id,
    documentTitle: c.document_title,
    chunkIndex: c.chunk_index,
    score,
  }
  if (typeof c.excerpt === "string") {
    result.excerpt = c.excerpt
  }
  return result
}

function parseMessageStart(input: unknown): ConversationEvent | null {
  if (!input || typeof input !== "object") return null
  const candidate = input as Record<string, unknown>
  if (candidate.type !== "message_start") return null
  if (!isNonEmptyString(candidate.message_id)) return null
  return {
    type: "message_start",
    messageId: candidate.message_id,
  }
}

function parseToken(input: unknown): ConversationEvent | null {
  if (!input || typeof input !== "object") return null
  const candidate = input as Record<string, unknown>
  if (candidate.type !== "token") return null
  if (typeof candidate.content !== "string") return null
  return {
    type: "token",
    content: candidate.content,
  }
}

function parseCitationEvent(input: unknown): ConversationEvent | null {
  if (!input || typeof input !== "object") return null
  const candidate = input as Record<string, unknown>
  if (candidate.type !== "citation") return null
  const citation = parseCitation(candidate.citation)
  if (!citation) return null
  return {
    type: "citation",
    citation,
  }
}

function parseMessageComplete(input: unknown): ConversationEvent | null {
  if (!input || typeof input !== "object") return null
  const candidate = input as Record<string, unknown>
  if (candidate.type !== "message_complete") return null
  if (!isNonEmptyString(candidate.message_id)) return null
  return {
    type: "message_complete",
    messageId: candidate.message_id,
  }
}

function parseError(input: unknown): ConversationEvent | null {
  if (!input || typeof input !== "object") return null
  const candidate = input as Record<string, unknown>
  if (candidate.type !== "error") return null
  if (!isNonEmptyString(candidate.code)) return null
  const result: { type: "error"; code: string; message?: string } = {
    type: "error",
    code: candidate.code,
  }
  if (typeof candidate.message === "string") {
    result.message = candidate.message
  }
  return result
}

/**
 * Parse a raw WebSocket frame into a typed
 * conversation event. Returns `null` for any
 * malformed input — the caller should
 * `console.warn` and move on (Task 26).
 */
export function parseConversationEvent(data: string): ConversationEvent | null {
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    return null
  }
  return (
    parseMessageStart(raw) ??
    parseToken(raw) ??
    parseCitationEvent(raw) ??
    parseMessageComplete(raw) ??
    parseError(raw)
  )
}
