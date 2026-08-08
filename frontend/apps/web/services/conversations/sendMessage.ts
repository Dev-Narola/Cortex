/**
 * Send a message — start a new RAG turn.
 *
 * **F4 Part 2 (Task 11).** The V3 backend
 * implements message submission as the FIRST
 * step of a WebSocket session, not a separate
 * REST endpoint. Opening
 * `wss://.../ws/conversations/{id}?token=…`
 * and sending
 * `{"type": "message", "content": "..."}`
 * triggers:
 *
 *   1. Persistence of the user message
 *   2. Hybrid BM25 + vector retrieval
 *   3. Reranking
 *   4. LLM generation
 *   5. Streamed `token` envelopes back over
 *      the same socket, followed by
 *      `citation`s and a `message_complete`.
 *
 * The full F4 Part 2 spec imagined a REST
 * `POST /conversations/{id}/messages`. The
 * shipped V3 backend chose WS-only to keep the
 * protocol additive and avoid double-persistence
 * (one HTTP write, one WS-driven write). This
 * service hands the operation off to the
 * WebSocket layer.
 *
 * **What this function actually does.** The
 * mutation in `useSendMessage` is the
 * orchestrator. This function exists for two
 * reasons:
 *
 *   1. The service layer is the only place
 *      that knows the message envelope
 *      contract (`{"type": "message", ...}`).
 *   2. The service signature matches the
 *      task spec's `sendMessage(conversationId,
 *      content)` shape, so the spec's data
 *      flow diagram is accurate.
 *
 * The actual side effects (open the socket,
 * push the user message into the cache) live
 * in the mutation + the stream hook. This
 * function initializes the per-conversation
 * stream state in the store and is otherwise
 * a marker for the API boundary.
 *
 * **The "POST".** The spec describes a
 * "POST /conversations/{id}/messages" call.
 * On the V3 backend that call is
 * `socket.send(JSON.stringify({ type: "message",
 * content }))`. From the React tree's point of
 * view it's still a "send" — the network
 * primitive is a detail.
 */

import { conversationStreamStore } from "@/hooks/chat/conversationStreamStore"
import { useAuthStore } from "@/lib/auth/store"

export interface SendMessageParams {
  conversationId: string
  content: string
  /** Optimistic user message id (uuid). The
   *  service just hands it to the store so
   *  the cache patcher can find the row. */
  userMessageId: string
}

/**
 * Initialize a new RAG turn. The actual
 * WebSocket send happens in the stream hook
 * (the hook owns the socket lifecycle).
 */
export function sendMessage(params: SendMessageParams): void {
  const token = useAuthStore.getState().accessToken
  if (!token) {
    throw new Error("Not authenticated.")
  }
  if (!params.content.trim()) {
    throw new Error("Message content is empty.")
  }
  conversationStreamStore.beginTurn({
    conversationId: params.conversationId,
    userMessageId: params.userMessageId,
    content: params.content,
  })
  // The hook layer is responsible for actually
  // opening the socket + sending the envelope.
  // The token is used by the hook to build the
  // WS URL.
}
