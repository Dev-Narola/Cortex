/**
 * useConversationStream — the React-facing
 * abstraction over the WebSocket stream.
 *
 * **F4 Part 2 (Task 19).** Components subscribe
 * to this hook for the live state of the
 * assistant turn in flight. The hook:
 *
 *   1. Owns the per-conversation WebSocket
 *      lifecycle (refcounted singleton, the
 *      same pattern as F3 Part 4's
 *      `useIngestionStatus`).
 *   2. Routes socket events into the stream
 *      store (`conversationStreamStore`).
 *   3. Watches the store for new `sending`
 *      states and drives the socket: opens
 *      the connection, sends the user
 *      message, lets the events flow back.
 *   4. Returns the per-conversation selectors
 *      the UI needs (active stream, connection
 *      state, error).
 *   5. Releases the refcount on the LAST
 *      consumer's unmount.
 *
 * **The orchestration rule.** The mutation
 * (`useSendMessage`) only writes the
 * optimistic user message + flips the store
 * to `sending` via `beginTurn`. It does NOT
 * touch the socket. THIS hook is the single
 * place that converts "store says sending"
 * into "WebSocket open + message sent". The
 * store is the protocol; this hook is the
 * transport.
 *
 * **`conversationId: null`.** The `/chat`
 * new-conversation flow has no id yet; the
 * hook is a no-op.
 *
 * **`isSending` vs `isStreaming` vs `isBusy`.**
 *   - `isSending`     — store says `sending`
 *                       (POST/WS sent, no
 *                       `message_start` yet)
 *   - `isStreaming`   — store says `streaming`
 *                       (tokens arriving)
 *   - `isBusy`        — `isSending || isStreaming`
 *                       (used to disable the input)
 */

"use client"

import { useEffect, useRef } from "react"

import { useAuthStore } from "@/lib/auth/store"
import type { WebSocketState } from "@/lib/websocket/client"
import {
  ConversationSocket,
  type ConversationStateListener,
} from "@/lib/websocket/conversation-client"
import type { ConversationEvent } from "@/types/websocket"

import {
  useConversationStreamStore,
  type ActiveStream,
} from "./conversationStreamStore"

const EMPTY_STREAM: ActiveStream = {
  conversationId: "",
  assistantMessageId: null,
  content: "",
  citations: [],
  status: "idle",
  error: null,
  optimisticUserMessageId: null,
  pendingContent: null,
}

export interface UseConversationStreamResult {
  stream: ActiveStream
  connectionState: WebSocketState
  isSending: boolean
  isStreaming: boolean
  isBusy: boolean
  isCompleted: boolean
  error: { code: string; message?: string } | null
}

// -------------------------------------------------------------------
// Module-level socket registry
// -------------------------------------------------------------------
//
// One socket per (conversationId, token). The
// refcount goes up by 1 on each mount that
// passes a non-null id; the LAST unmount
// disconnects. This mirrors the
// `useIngestionStatus` pattern (F3 Part 4).

interface SocketEntry {
  socket: ConversationSocket
  refCount: number
  wired: boolean
  /**
   * The optimistic user message id this
   * socket has consumed. The hook uses this
   * to dedupe the "store says sending →
   * send over WS" handoff when the mutation
   * flips the same row to `sending` again
   * (e.g. after a previous turn completed).
   */
  sentForUserMessageId: string | null
}

const socketRegistry = new Map<string, SocketEntry>()

function keyFor(conversationId: string, accessToken: string): string {
  return `${conversationId}::${accessToken}`
}

function acquire(
  conversationId: string,
  accessToken: string,
): { socket: ConversationSocket; entry: SocketEntry } {
  const key = keyFor(conversationId, accessToken)
  const existing = socketRegistry.get(key)
  if (existing) {
    existing.refCount += 1
    return { socket: existing.socket, entry: existing }
  }
  const socket = new ConversationSocket({ conversationId, accessToken })
  const entry: SocketEntry = {
    socket,
    refCount: 1,
    wired: false,
    sentForUserMessageId: null,
  }
  socketRegistry.set(key, entry)
  return { socket, entry }
}

function release(conversationId: string, accessToken: string): void {
  const key = keyFor(conversationId, accessToken)
  const entry = socketRegistry.get(key)
  if (!entry) return
  entry.refCount -= 1
  if (entry.refCount <= 0) {
    entry.socket.disconnect()
    socketRegistry.delete(key)
  }
}

/**
 * Drop all sockets. Test-only escape hatch.
 */
export function _resetConversationSockets(): void {
  for (const entry of socketRegistry.values()) entry.socket.disconnect()
  socketRegistry.clear()
}

// -------------------------------------------------------------------
// Hook
// -------------------------------------------------------------------

export function useConversationStream(
  conversationId: string | null,
): UseConversationStreamResult {
  const accessToken = useAuthStore((s) => s.accessToken)
  const stream = useConversationStreamStore((s) =>
    conversationId ? s.streams.get(conversationId) : undefined,
  )
  const connectionState = useConversationStreamStore((s) =>
    conversationId
      ? (s.connections.get(conversationId) ?? ("idle" as WebSocketState))
      : ("idle" as WebSocketState),
  )

  // Per-mount acquisition / release. We hold
  // the socket on a ref so the effect that
  // watches the store for `sending` can read
  // it without re-running the acquire effect.
  const socketRef = useRef<ConversationSocket | null>(null)
  const entryRef = useRef<SocketEntry | null>(null)
  useEffect(() => {
    if (!conversationId || !accessToken) return
    const { socket, entry } = acquire(conversationId, accessToken)
    socketRef.current = socket
    entryRef.current = entry

    if (!entry.wired) {
      entry.wired = true
      const onEvent = (event: ConversationEvent) => {
        useConversationStreamStore
          .getState()
          .applyEvent(conversationId, event)
      }
      const onState: ConversationStateListener = (state) => {
        useConversationStreamStore
          .getState()
          .setConnectionState(conversationId, state)
      }
      // F4 Part 4 (Task 94): the socket
      // died before `message_complete`.
      // Distinguish a user-initiated close
      // (navigated away) from an unexpected
      // drop. The latter flips the store
      // to `interrupted` so the banner can
      // render. The `wasClosedByUser` flag
      // is the ConversationSocket's own
      // discriminator.
      const onClose = () => {
        if (socket.wasClosedByUser()) return
        useConversationStreamStore
          .getState()
          .markInterrupted(
            conversationId,
            "Lost the connection before the response finished.",
          )
      }
      socket.subscribe(onEvent)
      socket.subscribeState(onState)
      socket.subscribeClose(onClose)
      // Sync the initial connection state in
      // case the socket is already open from
      // a previous mount.
      useConversationStreamStore
        .getState()
        .setConnectionState(conversationId, socket.getState())
    }

    return () => {
      socketRef.current = null
      entryRef.current = null
      release(conversationId, accessToken)
    }
  }, [conversationId, accessToken])

  // Watch the store for the `sending` state
  // and drive the socket. The mutation flips
  // the store to `sending`; this effect picks
  // it up and opens the socket + sends the
  // message. The dedupe guard is the
  // `sentForUserMessageId` on the entry.
  useEffect(() => {
    if (!conversationId) return
    if (!stream || stream.status !== "sending") return
    const entry = entryRef.current
    const socket = socketRef.current
    if (!entry || !socket) return
    if (
      stream.optimisticUserMessageId &&
      entry.sentForUserMessageId === stream.optimisticUserMessageId
    ) {
      return // already sent
    }
    const pending = stream.pendingContent
    if (!pending) return
    // Open the socket + send the user
    // message. The WebSocketClient queues
    // the message if the handshake is still
    // in flight; the queue drains on `open`.
    socket.connect()
    socket.sendMessage(pending)
    entry.sentForUserMessageId = stream.optimisticUserMessageId
    // The content is no longer needed in the
    // store once the socket has accepted the
    // send.
    useConversationStreamStore
      .getState()
      .clearPendingContent(conversationId)
  }, [stream, conversationId])

  const active: ActiveStream =
    stream ?? { ...EMPTY_STREAM, conversationId: conversationId ?? "" }
  return {
    stream: active,
    connectionState,
    isSending: active.status === "sending",
    isStreaming: active.status === "streaming",
    isBusy:
      active.status === "sending" || active.status === "streaming",
    isCompleted: active.status === "completed",
    error: active.error,
  }
}
