/**
 * ConversationView — the client half of
 * `/chat/{conversationId}`.
 *
 * **F4 Part 1 (Task 7 + 14).** Reads the conversation
 * via `useConversation(id)`, renders the layout
 * with the loaded messages, and shows a friendly
 * error state on fetch failure (no toast spam — the
 * page is the surface, the spec is explicit about
 * that).
 *
 * **Loading.** Handled by the route's `loading.tsx`
 * (renders a Skeleton-based chrome).
 *
 * **Empty conversation.** A conversation with no
 * messages yet (just created) shows the
 * `ChatEmptyState` via `MessageList` + the input
 * is ready.
 *
 * **Send handler.** No-op in Part 1 (Part 2 wires
 * the real flow). The toast matches the
 * `/chat` new-conversation flow.
 */

"use client"

import { useCallback, type ReactNode } from "react"

import { toast } from "@cortex/ui"

import { ChatErrorState } from "@/components/chat/ChatErrorState"
import { ChatLayout } from "@/components/chat/ChatLayout"
import { Spinner } from "@cortex/ui"
import { useConversation } from "@/hooks/chat"

export interface ConversationViewProps {
  conversationId: string
}

export function ConversationView({
  conversationId,
}: ConversationViewProps): ReactNode {
  const { data, isLoading, isError, error, refetch } =
    useConversation(conversationId)

  const handleSend = useCallback((value: string) => {
    toast({
      title: "Message ready",
      description: `“${value}” — sending lands in F4 Part 2.`,
    })
  }, [])

  if (isLoading) {
    // Route-level `loading.tsx` covers the initial
    // mount; this branch catches refetches that
    // happen after the data is already on screen.
    return (
      <div
        className="flex h-full min-h-[40vh] items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <Spinner size="lg" />
      </div>
    )
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
      onSend={handleSend}
    />
  )
}
