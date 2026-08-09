/**
 * Citation resolver — F4 Part 3 (Task 39).
 *
 * **Responsibility.** Turn a message's
 * `retrievedChunkIds` plus a list of streamed
 * citation envelopes into a stable, indexed
 * `Citation[]` that the UI can render without
 * re-doing the mapping on every render.
 *
 * **Data flow.** The backend V3 streams
 * `citation` envelopes in numerical order
 * during the assistant turn. The frontend's
 * `useConversationStream` already appends each
 * `ConversationCitation` to the store's
 * accumulator. By the time `message_complete`
 * fires, the store has a complete, in-order
 * list. The resolver:
 *
 *   1. Filters the streamed citations to the
 *      chunk IDs the server persisted on the
 *      message (the trust anchor — we only
 *      surface citations the server explicitly
 *      recorded on this message).
 *   2. Re-numbers them 1..N in stream order,
 *      which is the order the backend emitted
 *      them in.
 *   3. Returns a list of `Citation` objects
 *      with stable `id`s and `index` values
 *      the chip + panel can rely on.
 *
 * **Why filter by `retrievedChunkIds`.** The
 * backend's `retrieved_chunk_ids` is the
 * authoritative list of chunks the assistant
 * actually used. A buggy or future-versioned
 * stream might emit extra citations; we never
 * surface a citation the server didn't record
 * on the message. This satisfies the
 * "every claim traceable to a real chunk"
 * trust requirement.
 *
 * **Why not just use stream order.** Filtering
 * to `retrievedChunkIds` preserves the
 * "exactly N citations for N chunks"
 * invariant, which lets the chip index
 * match the backend's numbered citations
 * 1:1 — even if a future V4 changes the
 * stream order.
 *
 * **Pure data layer.** No React, no UI. Lives
 * in `lib/chat` so both the message-bubble
 * renderer and the citation panel can call it
 * with the same data.
 */

import type { Message } from "@/types/conversation"
import type { Citation } from "@/types/citation"
import {
  makeCitationFromStream,
  makeCitationId,
} from "@/types/citation"

export interface ResolveCitationsInput {
  message: Pick<Message, "id" | "retrievedChunkIds">
  /**
   * Citations the WS stream delivered during
   * the assistant turn. May contain entries
   * the server did not record on the message
   * (e.g. an aborted turn); the resolver
   * filters them out.
   */
  streamed: ReadonlyArray<{
    documentId: string
    chunkId: string
    documentTitle: string
    chunkIndex: number
    score: number
    excerpt?: string
  }>
}

/**
 * Resolve a message's citations.
 *
 * Returns an array (possibly empty) in stream
 * order. The empty case is valid — the
 * assistant might not have grounded the
 * answer (e.g. a simple greeting, or the
 * knowledge base was empty for this query).
 */
export function resolveCitations(
  input: ResolveCitationsInput,
): Citation[] {
  const { message, streamed } = input

  // No chunks recorded on the message → no
  // citations. The UI renders an empty
  // marker list (Task 73: "no fake
  // citations").
  if (message.retrievedChunkIds.length === 0) {
    return []
  }

  // Build an O(1) lookup of the message's
  // chunk ids so the resolver can filter
  // the streamed citations in a single pass.
  const allowed = new Set(message.retrievedChunkIds)

  // Dedupe by chunk id. The stream can emit
  // the same chunk twice in pathological
  // cases; the resolver must still produce
  // exactly one citation per chunk.
  const seen = new Set<string>()

  const out: Citation[] = []
  let nextIndex = 1
  for (const wire of streamed) {
    if (!allowed.has(wire.chunkId)) continue
    if (seen.has(wire.chunkId)) continue
    seen.add(wire.chunkId)
    out.push(makeCitationFromStream(wire, nextIndex))
    nextIndex += 1
  }

  return out
}

/**
 * Build the bare-minimum chip model from a
 * resolved `Citation[]`. The chip only
 * needs the index + a stable id + a pointer
 * to the chunk/document for the "View full
 * document" deep link.
 *
 * Separated from the full `Citation` so the
 * message-bubble renderer can pass a tiny
 * payload through the citation chip without
 * carrying the excerpt + score around in
 * every message render.
 */
export function toChipModels(
  citations: ReadonlyArray<Citation>,
): ReadonlyArray<{ id: string; index: number; documentId: string; chunkId: string }> {
  return citations.map((c) => ({
    id: c.id,
    index: c.index,
    documentId: c.documentId,
    chunkId: c.chunkId,
  }))
}

/**
 * Stable id for a citation, derived from its
 * chunk id. The chip + the panel both use
 * this so a click on the chip selects the
 * same panel entry the panel renders.
 */
export function citationIdForChunk(chunkId: string): string {
  return makeCitationId(chunkId)
}
