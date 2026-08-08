/**
 * useSendMessage — the TanStack Mutation that
 * starts a new RAG turn.
 *
 * **F4 Part 2 (Tasks 12, 14, 25, 28).** The
 * mutation:
 *
 *   1. Generates a uuid for the optimistic
 *      user message (Task 14: write to the
 *      cache immediately so the message
 *      appears without waiting for the
 *      server round-trip).
 *   2. Patches the conversation cache to
 *      append the user message to the
 *      existing list.
 *   3. Calls `sendMessage` (Task 11), which
 *      initialises the stream store. The
 *      `useConversationStream` hook picks up
 *      the `sending` state and opens the
 *      WebSocket + sends the envelope.
 *   4. Returns immediately. The streamed
 *      response is read by the `StreamingMessage`
 *      component via the store.
 *
 * **No polling, no setInterval.** The
 * mutation is fire-and-forget; everything
 * else flows through the WebSocket.
 *
 * **Cache patch shape (Task 14).** The
 * `useConversation` query has key
 * `["conversations", id]` and value
 * `Conversation`. We append the optimistic
 * message to `conversation.messages`. The
 * server-authoritative row replaces the
 * optimistic one when the user refetches
 * (Task 25) — see the `invalidateOnComplete`
 * callback below.
 *
 * **Duplication guard (Task 28).** The store
 * already drops a second `beginTurn` if a
 * turn is in flight. The mutation also
 * checks `isPending` + the stream status
 * for defense in depth.
 *
 * **Error surfacing (Task 35).** The
 * mutation throws on synchronous failures
 * (e.g. unauthenticated). Async WebSocket
 * errors are surfaced by the store's
 * `error` field; the page reads it via
 * `useConversationStream` and toasts.
 */

"use client"

import { useCallback, useEffect } from "react"
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query"

import { sendMessage } from "@/services/conversations"
import { useConversationStreamStore } from "./conversationStreamStore"
import type { Conversation, Message } from "@/types/conversation"

export interface UseSendMessageParams {
  conversationId: string
}

export interface SendMessageVariables {
  content: string
}

export type UseSendMessageResult = UseMutationResult<
  { userMessageId: string; conversationId: string },
  Error,
  SendMessageVariables,
  { previousConversation: Conversation | undefined }
>

/**
 * Build an optimistic `Message` for the user
 * turn. The id is a local uuid (the server
 * will assign a real one when it persists
 * the row). The `createdAt` is `new Date()`
 * for now; the server row will eventually
 * replace it.
 */
function makeOptimisticUserMessage(
  conversationId: string,
  content: string,
): Message {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return {
    id,
    conversationId,
    role: "user",
    content,
    tokenCount: 0,
    retrievedChunkIds: [],
    modelName: null,
    createdAt: new Date().toISOString(),
  }
}

export function useSendMessage(
  params: UseSendMessageParams,
): UseSendMessageResult {
  const qc = useQueryClient()
  const { conversationId } = params

  return useMutation<
    { userMessageId: string; conversationId: string },
    Error,
    SendMessageVariables,
    { previousConversation: Conversation | undefined }
  >({
    mutationFn: ({ content }) => {
      // Duplication guard (Task 28). If a
      // turn is in flight (sending or
      // streaming), drop the second submit
      // on the floor BEFORE we patch the
      // cache. The mutation's `onError`
      // path rolls back, so a dropped
      // submit leaves no trace.
      const current = useConversationStreamStore
        .getState()
        .streams.get(conversationId)
      if (
        current &&
        (current.status === "sending" || current.status === "streaming")
      ) {
        throw new Error("A message is already being sent.")
      }

      // Build the optimistic message + patch
      // the cache BEFORE we touch the
      // network. This is what makes the user
      // message appear instantly (Task 13).
      const optimistic = makeOptimisticUserMessage(conversationId, content)
      qc.setQueryData<Conversation>(
        ["conversations", conversationId],
        (prev) => {
          if (!prev) return prev
          return {
            ...prev,
            messages: [...(prev.messages ?? []), optimistic],
          }
        },
      )
      // Kick off the WS turn. The stream hook
      // watches the store + opens the socket.
      sendMessage({
        conversationId,
        content,
        userMessageId: optimistic.id,
      })
      return Promise.resolve({
        userMessageId: optimistic.id,
        conversationId,
      })
    },
    onMutate: async () => {
      // No async network call, but TanStack
      // requires a defined `context` shape.
      // We snapshot the previous conversation
      // so the rollback can restore it on
      // error.
      const previousConversation = qc.getQueryData<Conversation>([
        "conversations",
        conversationId,
      ])
      return { previousConversation }
    },
    onError: (_err, _vars, context) => {
      // Synchronous failure: roll back the
      // optimistic patch. (Async WS errors
      // are surfaced by the store separately.)
      if (context?.previousConversation) {
        qc.setQueryData(
          ["conversations", conversationId],
          context.previousConversation,
        )
      }
    },
  })
}

/**
 * `useInvalidateOnStreamComplete` — call this
 * from the page to refresh the conversation
 * cache when the stream lands in `completed`.
 * The hook is split out so the page (not the
 * mutation) owns when to refetch; the stream
 * store outlives the mutation's life-cycle.
 *
 * Task 25: the server has persisted the
 * assistant message by the time the client
 * receives `message_complete`. The
 * authoritative state is therefore
 * `GET /conversations/{id}`.
 */
export function useInvalidateOnStreamComplete(conversationId: string): void {
  const qc = useQueryClient()
  const status = useConversationStreamStore(
    (s) => s.streams.get(conversationId)?.status ?? "idle",
  )
  // We deliberately read `status` and
  // invalidate in the same render the
  // transition happens. The query is
  // refetched on the next tick.
  // We use a memoised callback so the effect
  // dependency is stable.
  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["conversations", conversationId] })
  }, [qc, conversationId])
  useEffect(() => {
    if (status === "completed") {
      // Defer to a microtask so the optimistic
      // patch isn't visible at the same render
      // as the refetch.
      queueMicrotask(invalidate)
    }
  }, [status, invalidate])
}
