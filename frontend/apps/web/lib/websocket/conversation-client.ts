/**
 * Conversation WebSocket client — the per-conversation
 * transport for the F4 streaming channel.
 *
 * **F4 Part 2 (Tasks 15 + 16).** This is a thin
 * specialization of the generic `WebSocketClient`
 * introduced in F3 Part 4. It owns:
 *
 *   - The connection URL
 *     (`{NEXT_PUBLIC_WS_URL}/ws/conversations/{id}?token=<jwt>`).
 *   - The client message envelope
 *     (`{"type": "message", "content": "..."}`).
 *   - The connection lifecycle (open / close / reconnect).
 *
 * It does NOT own:
 *
 *   - Event parsing (the parser is `parseConversationEvent`).
 *   - State management (the stream store is
 *     `hooks/chat/conversationStreamStore.ts`).
 *   - Subscription (the stream store subscribes; this
 *     client emits typed events).
 *
 * **Auth (Task 16).** The browser `WebSocket` API
 * can't set custom headers; the JWT travels in a
 * `?token=...` query param. The backend's
 * `_authenticate` reads the same param the MCP and
 * ingestion channels use, so the auth code path is
 * shared.
 *
 * **One instance per (conversationId, token).** The
 * stream store owns the refcount. The client is
 * intentionally not a singleton — if the user
 * switches conversations we open a fresh socket
 * against the new id.
 *
 * **Reconnection (Task 27).** The generic
 * `WebSocketClient` owns the exponential-backoff
 * loop. We deliberately DO NOT auto-retry the
 * message: a half-streamed RAG turn that
 * reconnects mid-stream is not safely resumable
 * (the backend doesn't expose stream offsets). A
 * drop transitions the stream into an error state
 * the user can recover from — never silently
 * re-issues `POST /conversations/{id}/messages`.
 */

import { publicEnv } from "@cortex/config"

import {
  WebSocketClient,
  type WebSocketState,
} from "@/lib/websocket/client"
import { parseConversationEvent } from "@/lib/websocket/parseConversationEvent"
import type { ConversationEvent } from "@/types/websocket"

export type ConversationEventListener = (event: ConversationEvent) => void
export type ConversationStateListener = (state: WebSocketState) => void
export type ConversationCloseListener = (event: CloseEvent) => void

export interface ConversationSocketOptions {
  conversationId: string
  accessToken: string
  /**
   * Max reconnect delay (ms). Defaults to 5 000 —
   * shorter than the ingestion channel because the
   * chat UX wants a fast "Recover" prompt if the
   * socket drops mid-turn.
   */
  maxReconnectDelayMs?: number
}

/**
 * Build the WS URL for the conversation channel.
 * Exported so tests can pin the contract.
 */
export function buildConversationSocketUrl(
  conversationId: string,
  accessToken: string,
): string {
  const base = publicEnv.NEXT_PUBLIC_WS_URL.replace(/\/+$/, "")
  const url = new URL(`${base}/ws/conversations/${encodeURIComponent(conversationId)}`)
  url.searchParams.set("token", accessToken)
  return url.toString()
}

/**
 * Per-conversation WebSocket transport.
 *
 * The store layer holds the instance and
 * refcounts it. The React UI never sees
 * `new WebSocket` — it subscribes to the store.
 */
export class ConversationSocket {
  private client: WebSocketClient
  private listeners = new Set<ConversationEventListener>()
  private stateListeners = new Set<ConversationStateListener>()
  private closeListeners = new Set<ConversationCloseListener>()
  private closedByUser = false

  constructor(options: ConversationSocketOptions) {
    this.client = new WebSocketClient({
      url: buildConversationSocketUrl(
        options.conversationId,
        options.accessToken,
      ),
      maxReconnectDelayMs: options.maxReconnectDelayMs ?? 5_000,
      initialReconnectDelayMs: 500,
      onStateChange: (state) => {
        for (const fn of this.stateListeners) fn(state)
      },
      onMessage: (data) => {
        const event = parseConversationEvent(data)
        if (!event) {
          if (typeof console !== "undefined") {
            console.warn(
              "[conversationSocket] dropped malformed event:",
              data,
            )
          }
          return
        }
        for (const fn of this.listeners) fn(event)
      },
      onError: () => {
        // The low-level error event is always
        // followed by a `close`. We don't need
        // a per-error hook for F4 Part 2; the
        // close path handles "drop during turn".
      },
    })
  }

  // -----------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------

  connect(): void {
    this.closedByUser = false
    this.client.connect()
  }

  /**
   * Close the connection. After this call the
   * client will NOT auto-reconnect. The store
   * layer uses this on stream reset + the last
   * consumer unmounting.
   */
  disconnect(): void {
    this.closedByUser = true
    this.client.disconnect()
  }

  /**
   * Send a user message to the backend. The
   * message is queued if the socket is still
   * connecting — the underlying client drains
   * the queue on `open`. Returns `true` if
   * the message was either sent or queued,
   * `false` if the socket is dead and the
   * message was dropped.
   */
  sendMessage(content: string): boolean {
    if (!content.trim()) return false
    if (this.closedByUser) return false
    // The underlying client returns `true`
    // only when the socket is already open;
    // queued messages return `false`. We
    // treat both as "the message was
    // accepted" — a queued message will
    // flush on `open`.
    this.client.send(JSON.stringify({ type: "message", content }))
    return this.client.getState() !== "closed"
  }

  getState(): WebSocketState {
    return this.client.getState()
  }

  /**
   * True if the connection drop was user-initiated
   * (we called `disconnect`) or a normal close. The
   * store uses this to distinguish "user navigated
   * away" from "the socket died mid-turn".
   */
  wasClosedByUser(): boolean {
    return this.closedByUser
  }

  // -----------------------------------------------------------------
  // Subscriptions
  // -----------------------------------------------------------------

  subscribe(listener: ConversationEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeState(listener: ConversationStateListener): () => void {
    this.stateListeners.add(listener)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  /**
   * Listen for the underlying CloseEvent so the
   * store can distinguish an unexpected drop from
   * a user-initiated disconnect. The generic
   * client already handles reconnection; this hook
   * is purely informational.
   */
  subscribeClose(listener: ConversationCloseListener): () => void {
    this.closeListeners.add(listener)
    return () => {
      this.closeListeners.delete(listener)
    }
  }
}
