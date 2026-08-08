/**
 * Conversation stream store — Zustand-backed,
 * the single source of truth for transient
 * streaming UI state per conversation.
 *
 * **F4 Part 2 (Task 21).** Server messages live
 * in the TanStack Query cache (Task 14). This
 * store is the local UI state for the
 * generation in flight: the accumulator buffer,
 * the citations collected so far, the streaming
 * status, and the connection state.
 *
 * **Why a store, not a hook-owned `useState`.**
 * Three reasons:
 *
 *   1. The WebSocket lifecycle is owned by a
 *      module-level singleton (refcounted
 *      against `useConversationStream` mounts).
 *      A hook-owned `useState` would lose the
 *      event subscription between renders.
 *   2. The streamed assistant message is
 *      appended to the conversation cache when
 *      the turn completes (Task 25). The store
 *      needs to outlive the component that
 *      started the turn so the cache patch
 *      has the final accumulator at hand.
 *   3. Multiple views (today: `ChatView` for
 *      the new-conversation flow +
 *      `ConversationView` for the existing
 *      one) drive the same store; the store is
 *      the one place the WS state lives.
 *
 * **State machine (Task 21).**
 *
 *   idle --(beginTurn)--> sending
 *   sending --(message_start)--> streaming
 *   sending --(error)--> error
 *   streaming --(message_complete)--> completed
 *   streaming --(error)--> error
 *   completed --(beginTurn)--> sending
 *   error --(beginTurn)--> sending
 *
 * **One turn at a time per conversation.**
 * `beginTurn` is a no-op if the store is
 * already `sending` or `streaming` — the
 * duplication guard (Task 28) is enforced
 * here, not in the React layer.
 *
 * **The accumulator.** The streamed `token`
 * events carry single chunks (not cumulative
 * content). The store joins them so React can
 * read the full so-far text without redoing
 * the concat on every render.
 *
 * **The socket lives in the hook layer.** The
 * store is pure data; `useConversationStream`
 * owns the per-conversation WebSocket. This
 * split keeps the store unit-testable in
 * isolation.
 */

import { create } from "zustand"

import type { WebSocketState } from "@/lib/websocket/client"
import type {
  ConversationCitation,
  ConversationEvent,
} from "@/types/websocket"

/**
 * Per-conversation turn state. We don't keep
 * history in here — completed turns move into
 * the TanStack Query cache. The store only
 * tracks the *current* in-flight turn.
 */
export type StreamStatus =
  | "idle"
  | "sending" // ws open, no message_start yet
  | "streaming" // message_start received, tokens arriving
  | "completed" // message_complete received, persisted
  | "error" // terminal failure

export interface ActiveStream {
  /** Conversation id this stream belongs to. */
  conversationId: string
  /** Server-assigned assistant message id (from
   *  the first `message_start`). */
  assistantMessageId: string | null
  /** Accumulated text from every `token` event. */
  content: string
  /** Citations collected in numerical order. */
  citations: ConversationCitation[]
  /** Current status. */
  status: StreamStatus
  /** Last error code/message (only meaningful
   *  when `status === "error"`). */
  error: { code: string; message?: string } | null
  /** Optimistic user message id, kept here
   *  so the cache patcher can replace the
   *  optimistic row with the server row
   *  when streaming completes. */
  optimisticUserMessageId: string | null
  /**
   * The content of the user message, kept
   * here so the stream hook can read it back
   * to send over the WebSocket. Cleared once
   * the socket has accepted the send.
   */
  pendingContent: string | null
}

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

interface ConversationStreamState {
  /** Active stream keyed by conversation id.
   *  Only one entry can exist per id. */
  streams: Map<string, ActiveStream>
  /** Connection state per conversation id.
   *  Tracked separately so the UI can show a
   *  subtle indicator even when no turn is
   *  in flight. */
  connections: Map<string, WebSocketState>

  /** Initialize a per-conversation stream in
   *  the `sending` state. Called from the
   *  `useSendMessage` mutation. Idempotent —
   *  the second call is a no-op if a turn is
   *  already in flight. */
  beginTurn: (input: {
    conversationId: string
    userMessageId: string
    content: string
  }) => void
  /** Reset the per-conversation stream to
   *  idle. Called when the user navigates
   *  away + on explicit cancel. */
  resetTurn: (conversationId: string) => void
  /** Apply a parsed WS event. */
  applyEvent: (conversationId: string, event: ConversationEvent) => void
  /** Connection-state transition. */
  setConnectionState: (conversationId: string, state: WebSocketState) => void
  /**
   * Drop the `pendingContent` once the socket
   * has accepted the send. Keeps the store
   * from holding the content in memory any
   * longer than needed.
   */
  clearPendingContent: (conversationId: string) => void
  /** Test-only: drop all state. */
  resetAll: () => void
}

export const useConversationStreamStore =
  create<ConversationStreamState>((set) => ({
    streams: new Map(),
    connections: new Map(),

    beginTurn: ({ conversationId, userMessageId, content }) => {
      set((s) => {
        const current = s.streams.get(conversationId)
        if (
          current &&
          (current.status === "sending" ||
            current.status === "streaming")
        ) {
          // Duplication guard (Task 28). Drop
          // the second submit on the floor.
          return s
        }
        const nextStreams = new Map(s.streams)
        nextStreams.set(conversationId, {
          ...EMPTY_STREAM,
          conversationId,
          status: "sending",
          optimisticUserMessageId: userMessageId,
          pendingContent: content,
        })
        return { streams: nextStreams }
      })
    },

    resetTurn: (conversationId) => {
      set((s) => {
        const nextStreams = new Map(s.streams)
        nextStreams.set(conversationId, { ...EMPTY_STREAM })
        return { streams: nextStreams }
      })
    },

    applyEvent: (conversationId, event) => {
      set((s) => {
        const current =
          s.streams.get(conversationId) ??
          { ...EMPTY_STREAM, conversationId }
        let next: ActiveStream = current
        switch (event.type) {
          case "message_start":
            next = {
              ...current,
              assistantMessageId: event.messageId,
              status: "streaming",
            }
            break
          case "token":
            next = {
              ...current,
              content: current.content + event.content,
            }
            break
          case "citation":
            next = {
              ...current,
              citations: [...current.citations, event.citation],
            }
            break
          case "message_complete":
            next = {
              ...current,
              status: "completed",
            }
            break
          case "error":
            next = {
              ...current,
              status: "error",
              error: {
                code: event.code,
                ...(event.message !== undefined
                  ? { message: event.message }
                  : {}),
              },
            }
            break
        }
        const nextStreams = new Map(s.streams)
        nextStreams.set(conversationId, next)
        return { streams: nextStreams }
      })
    },

    setConnectionState: (conversationId, state) => {
      set((s) => {
        const nextConnections = new Map(s.connections)
        nextConnections.set(conversationId, state)
        return { connections: nextConnections }
      })
    },

    clearPendingContent: (conversationId) => {
      set((s) => {
        const current = s.streams.get(conversationId)
        if (!current) return s
        if (current.pendingContent === null) return s
        const nextStreams = new Map(s.streams)
        nextStreams.set(conversationId, { ...current, pendingContent: null })
        return { streams: nextStreams }
      })
    },

    resetAll: () => {
      set(() => ({
        streams: new Map(),
        connections: new Map(),
      }))
    },
  }))

/**
 * The store handle used by `sendMessage` to
 * kick off a turn. (Re-exported for clarity at
 * the call site; avoids leaking the full
 * Zustand API into the service layer.)
 */
export const conversationStreamStore = {
  beginTurn: (input: {
    conversationId: string
    userMessageId: string
    content: string
  }) => useConversationStreamStore.getState().beginTurn(input),
  resetTurn: (conversationId: string) =>
    useConversationStreamStore.getState().resetTurn(conversationId),
  applyEvent: (conversationId: string, event: ConversationEvent) =>
    useConversationStreamStore.getState().applyEvent(conversationId, event),
  setConnectionState: (conversationId: string, state: WebSocketState) =>
    useConversationStreamStore.getState().setConnectionState(conversationId, state),
  /**
   * Drop the `pendingContent` once the socket
   * has accepted the send. Keeps the store
   * from holding the content in memory any
   * longer than needed.
   */
  clearPendingContent: (conversationId: string) => {
    useConversationStreamStore.setState((s) => {
      const current = s.streams.get(conversationId)
      if (!current) return s
      if (current.pendingContent === null) return s
      const nextStreams = new Map(s.streams)
      nextStreams.set(conversationId, { ...current, pendingContent: null })
      return { streams: nextStreams }
    })
  },
  resetAll: () => useConversationStreamStore.getState().resetAll(),
}
