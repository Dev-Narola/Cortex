/**
 * ConversationView — the client half of
 * `/chat/{conversationId}`.
 *
 * **F4 Part 1 (Task 7 + 14) + Part 2.** Reads
 * the conversation via `useConversation(id)`,
 * renders the layout with the loaded messages,
 * and wires the real send + WebSocket flow.
 *
 * **Send (Part 2).** Uses `useSendMessage`,
 * which:
 *
 *   1. Patches the user message into the
 *      cache immediately (Task 14: "User
 *      message appears immediately").
 *   2. Calls `sendMessage` (the service),
 *      which flips the store to `sending`.
 *   3. The `useConversationStream` hook
 *      (mounted below) sees the `sending`
 *      state, opens the socket, sends the
 *      user message, and the assistant
 *      response streams in.
 *
 * **Stream completion (Task 25).** When the
 * store transitions to `completed`, the
 * `useInvalidateOnStreamComplete` hook
 * invalidates `["conversations", id]`. The
 * next render fetches the server-authoritative
 * message list (which now includes the user +
 * assistant rows the WS just persisted).
 *
 * **Errors (Task 26).** The mutation's
 * `onError` rolls back the optimistic cache
 * patch. Async WS errors are surfaced by the
 * store's `error` field; we toast them.
 *
 * **Loading.** Handled by the route's
 * `loading.tsx`. This component renders a
 * spinner for in-flight refetches.
 *
 * **Empty conversation.** A conversation with
 * no messages yet shows the `ChatEmptyState`
 * via `MessageList` + the input is ready.
 */

"use client"

import { useCallback, useEffect, type ReactNode } from "react"

import { toast } from "@cortex/ui"

import { ChatErrorState } from "@/components/chat/ChatErrorState"
import { ChatLayout } from "@/components/chat/ChatLayout"
import { ConversationSkeleton } from "@/components/chat/ConversationSkeleton"
import {
  useConversation,
  useConversationStream,
  useInvalidateOnStreamComplete,
  useSendMessage,
} from "@/hooks/chat"

export interface ConversationViewProps {
  conversationId: string
}

export function ConversationView({
  conversationId,
}: ConversationViewProps): ReactNode {
  const { data, isLoading, isError, error, refetch } =
    useConversation(conversationId)

  // Mount the stream hook. This is the single
  // place the WebSocket lifecycle lives; the
  // mutation flips the store to `sending`,
  // this hook opens the socket + sends the
  // message.
  const stream = useConversationStream(conversationId)
  // Invalidate the conversation query when
  // the stream completes (Task 25 + 36).
  useInvalidateOnStreamComplete(conversationId)

  const send = useSendMessage({ conversationId })

  // Surface WS errors as a toast (Task 26).
  // The hook above returns `error` for the
  // current turn; we toast once per error
  // transition. The dep is the `code` so
  // the effect doesn't refire on every
  // re-render with a new error object
  // reference.
  useEffect(() => {
    if (stream.error) {
      const friendly = friendlyErrorForCode(stream.error.code)
      toast({
        title: friendly.title,
        description:
          stream.error.message ??
          "Cortex couldn't complete this response.",
        variant: "destructive",
      })
    }
  }, [stream.error?.code, stream.error?.message])

  const handleSend = useCallback(
    (value: string) => {
      if (!value.trim()) return
      if (send.isPending || stream.isBusy) return
      send.mutate(
        { content: value },
        {
          onError: (err) => {
            toast({
              title: "Couldn't send your message",
              description:
                err instanceof Error ? err.message : "Try again in a moment.",
              variant: "destructive",
            })
          },
        },
      )
    },
    [send, stream.isBusy],
  )

  if (isLoading) {
    return <ConversationSkeleton pairCount={3} />
  }

  if (isError) {
    return (
      <div className="p-4">
        <ChatErrorState
          onRetry={() => {
            void refetch()
          }}
          message={
            error instanceof Error
              ? error.message
              : "Something went wrong reaching Cortex."
          }
        />
      </div>
    )
  }

  return (
    <ChatLayout
      title={data?.title ?? "Conversation"}
      messages={data?.messages ?? []}
      stream={stream.stream}
      conversationId={conversationId}
      isBusy={stream.isBusy}
      onSend={handleSend}
    />
  )
}

/**
 * Map backend error codes to a human-friendly
 * title. The body (if any) carries the actual
 * detail; we just pick the title.
 */
function friendlyErrorForCode(code: string): { title: string } {
  switch (code) {
    case "UNAUTHORIZED":
      return { title: "Your session has expired" }
    case "FORBIDDEN":
      return { title: "You don't have access to this conversation" }
    case "PERSISTENCE_FAILED":
      return { title: "Couldn't save your message" }
    case "GENERATION_FAILED":
      return { title: "Cortex couldn't complete this response" }
    case "BAD_REQUEST":
      return { title: "Your message was rejected" }
    default:
      return { title: "Generation failed" }
  }
}
