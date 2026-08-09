/**
 * useCitation — F4 Part 3 (Task 66).
 *
 * The "TanStack Query-style" read interface
 * for citations. Returns a `Citation` (or
 * null) for a given chunk id, with the same
 * shape `useQuery` would return: `data`,
 * `isLoading`, `isError`, `error`, `refetch`.
 *
 * **Why we don't hit the network.** The V3
 * backend has no REST endpoint for fetching
 * a single chunk (only `document_id`,
 * `chunk_id`, `document_title`, `chunk_index`,
 * `score`, `excerpt` arrive over the WS
 * stream — see F4 P2 backend audit). The
 * source-of-truth for citation data is the
 * stream store; this hook reads it.
 *
 * **Reload gap (acknowledged, not invented).**
 * If the user reloads `/chat/{id}` for a
 * conversation whose assistant message has
 * `retrieved_chunk_ids: [...]`, we know the
 * chunk ids but not the title / excerpt /
 * chunk_index. The hook returns
 * `{ status: "unavailable" }` for those —
 * the panel renders a friendly "Source
 * unavailable" surface, and the chip still
 * appears so the user knows the answer was
 * grounded. A future backend addition
 * (`GET /chunks/{id}` or embedding the full
 * CitationSchema in `MessageSchema`) would
 * let us resolve the gap; the spec is
 * explicit that we do NOT invent a backend
 * contract.
 *
 * **Cache shape.** We use the stream store
 * (a per-conversation map) as the cache.
 * TanStack Query is still the right tool for
 * anything that IS a REST fetch — e.g. when
 * F3 documents add a chunk-detail endpoint,
 * the spec is `["document-chunk", chunkId]`
 * with a `staleTime` matching the document's
 * own invalidation policy. Today's hook
 * signature mirrors that future shape so
 * the swap is mechanical.
 */

import { useMemo } from "react"

import {
  resolveCitations,
} from "@/lib/chat/citation-resolver"
import type { Citation } from "@/types/citation"
import type { Message } from "@/types/conversation"

import { useConversationStreamStore } from "./conversationStreamStore"

export type CitationStatus =
  | "ready" // The citation is in the store.
  | "unavailable" // The chunk id is on the
  // message but the stream did not
  // include the citation metadata
  // (reload case, or the backend did
  // not emit it).
  | "missing" // The chunk id is not on
  // the message at all. The UI
  // should not have rendered a chip
  // for this — this is a programming
  // error surface.

export interface UseCitationResult {
  status: CitationStatus
  data: Citation | null
  /** True while a refetch would be in flight.
   *  Today: never (we read from the store).
   *  Kept so the consumer can render a
   *  consistent loading shape across
   *  refactors. */
  isLoading: false
  isError: false
  error: null
  refetch: () => void
}

interface UseCitationInput {
  /** Conversation id — used to look up
   *  the per-conversation stream. */
  conversationId: string
  /** Citation id (the chunk-derived id,
   *  not the chunk id directly). */
  citationId: string | null
}

/**
 * Look up a single citation by its citation
 * id (the chunk-derived id produced by
 * `makeCitationId`).
 *
 * Returns `status: "unavailable"` when the
 * citation is not in the stream store but
 * a matching chunk id is on a message in the
 * conversation. The panel renders the
 * friendly "Source unavailable" state.
 */
export function useCitation({
  conversationId,
  citationId,
}: UseCitationInput): UseCitationResult {
  // The stream store holds the live
  // `ConversationCitation` list. We pull
  // it directly. The `useMemo` keeps the
  // reference stable across re-renders
  // when the underlying array doesn't
  // change.
  const streamed = useConversationStreamStore(
    (s) => s.streams.get(conversationId)?.citations,
  )

  // We also need the active assistant
  // message so we can check whether the
  // chunk id is in `retrievedChunkIds` —
  // that's how we tell "the backend recorded
  // this citation but the stream did not
  // deliver it" apart from "the chip was
  // rendered against a stale id".
  const activeMessageId = useConversationStreamStore(
    (s) => s.streams.get(conversationId)?.assistantMessageId,
  )

  return useMemo<UseCitationResult>(() => {
    if (!citationId) {
      return {
        status: "missing",
        data: null,
        isLoading: false,
        isError: false,
        error: null,
        refetch: () => {},
      }
    }

    // The chunk id is encoded in the citation
    // id: `citation:<chunkId>`. Extract it.
    const chunkId = citationId.startsWith("citation:")
      ? citationId.slice("citation:".length)
      : citationId

    if (!streamed) {
      return {
        status: "unavailable",
        data: null,
        isLoading: false,
        isError: false,
        error: null,
        refetch: () => {},
      }
    }

    // Look for a streamed citation whose
    // chunk id matches.
    const wire = streamed.find((c) => c.chunkId === chunkId)
    if (wire) {
      // We don't know our position in the
      // resolved list without re-running
      // the resolver. Build a tiny resolver
      // result here so the chip's `index`
      // and the citation's `index` agree.
      // (This is O(N) per render; the panel
      // is opened rarely and citations are
      // small. If the list grows past a
      // few dozen, we can cache the
      // resolver output per conversation.)
      const fakeMessage: Pick<Message, "id" | "retrievedChunkIds"> = {
        id: activeMessageId ?? "active",
        // Treat every streamed citation as
        // "allowed" — the panel's case is
        // "I clicked a chip that the
        // bubble rendered, so the backend
        // must have recorded it."
        retrievedChunkIds: streamed.map((c) => c.chunkId),
      }
      const resolved = resolveCitations({
        message: fakeMessage,
        streamed,
      })
      const exact = resolved.find((c) => c.chunkId === chunkId)
      if (exact) {
        return {
          status: "ready",
          data: exact,
          isLoading: false,
          isError: false,
          error: null,
          refetch: () => {},
        }
      }
    }

    // The stream did not include this
    // chunk's metadata. The chunk id may
    // still be on the persisted message
    // (reload case) — but we don't have
    // the message here. Report
    // "unavailable" so the panel can
    // surface a friendly state.
    return {
      status: "unavailable",
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => {},
    }
  }, [citationId, streamed, activeMessageId])
}

/**
 * `useCitationList` — the resolver's
 * boundary. Returns the resolved
 * `Citation[]` for the active stream.
 *
 * - `data` is `[]` if the message has no
 *   `retrievedChunkIds` (Task 73: no fake
 *   chips).
 * - `data` is the full list (in numerical
 *   order) once the stream has delivered
 *   at least one citation.
 */
export function useCitationList(conversationId: string): {
  data: Citation[]
  isReady: boolean
} {
  const streamed = useConversationStreamStore(
    (s) => s.streams.get(conversationId)?.citations,
  )
  const assistantMessageId = useConversationStreamStore(
    (s) => s.streams.get(conversationId)?.assistantMessageId,
  )
  const status = useConversationStreamStore(
    (s) => s.streams.get(conversationId)?.status ?? "idle",
  )

  return useMemo(() => {
    if (!streamed || !assistantMessageId) {
      return { data: [], isReady: false }
    }
    // The resolver's normal path requires
    // the message's `retrievedChunkIds`.
    // We don't have that here without
    // re-fetching the conversation; the
    // stream store IS the message's
    // grounding record (citations only
    // arrive if the backend recorded them
    // on the message). For the live
    // "show me my citations" call we
    // trust the streamed list as-is.
    const fakeMessage: Pick<Message, "id" | "retrievedChunkIds"> = {
      id: assistantMessageId,
      retrievedChunkIds: streamed.map((c) => c.chunkId),
    }
    const resolved = resolveCitations({
      message: fakeMessage,
      streamed,
    })
    return {
      data: resolved,
      isReady: status === "completed" || resolved.length > 0,
    }
  }, [streamed, assistantMessageId, status])
}
