/**
 * useResolvedCitations — resolve a message's
 * `retrievedChunkIds` against the live stream
 * store's accumulated citations.
 *
 * **F4 Part 3 (Task 64).** Citations arrive
 * during streaming, not before. The message
 * render path needs the full `Citation[]` to
 * know how many chips to render and what they
 * should label. This hook is the bridge: it
 * reads the message's chunk ids from
 * `useConversation` and the streamed citations
 * from the store, and produces a stable
 * `Citation[]`.
 *
 * **Memoised.** The resolver is O(N) over the
 * streamed citations per message. For
 * conversations with a dozen or so citations
 * and a hundred messages that's fine; if the
 * list grows we can cache the resolver output
 * per conversation.
 *
 * **Empty / missing case (Task 73).** If the
 * message has no `retrievedChunkIds`, returns
 * `[]` and `isReady: false`. The bubble
 * renders the answer without citation chips.
 * We do NOT invent chips.
 */

import { useMemo } from "react"

import { resolveCitations } from "@/lib/chat/citation-resolver"
import { useConversationStreamStore } from "./conversationStreamStore"

import type { Citation } from "@/types/citation"
import type { Message } from "@/types/conversation"

export interface UseResolvedCitationsResult {
  /** Resolved citations in stream order. */
  data: Citation[]
  /** True when the resolver has been able to
   *  produce a stable list (i.e. either we
   *  have citations, or the message
   *  definitively has none). */
  isReady: boolean
}

export function useResolvedCitations(
  message: Pick<Message, "id" | "retrievedChunkIds">,
  conversationId: string,
): UseResolvedCitationsResult {
  const streamed = useConversationStreamStore(
    (s) => s.streams.get(conversationId)?.citations,
  )
  const assistantMessageId = useConversationStreamStore(
    (s) => s.streams.get(conversationId)?.assistantMessageId,
  )

  return useMemo(() => {
    if (message.retrievedChunkIds.length === 0) {
      return { data: [], isReady: true }
    }
    if (!streamed) {
      return { data: [], isReady: false }
    }
    // The `assistantMessageId` is set once
    // `message_start` fires. Until then the
    // bubble for a *previous* assistant
    // turn in the same conversation can
    // still be rendered — its citations
    // are already on the message, and the
    // resolver filters the streamed list
    // to exactly the message's chunk ids.
    // We pass the message's own id so the
    // resolver can keep its tracking
    // stable.
    void assistantMessageId
    const resolved = resolveCitations({
      message,
      streamed,
    })
    return {
      data: resolved,
      isReady: true,
    }
  }, [message, streamed, assistantMessageId])
}
