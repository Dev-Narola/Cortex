/**
 * ChatView — the client half of `/chat`.
 *
 * **F4 Part 1 (Task 14) + Part 2 (new-conversation
 * flow).** Composes the chat module.
 *
 * **New-conversation send flow (Part 2).** The
 * `/chat` route has no id yet. The user types
 * their first question and presses Send. The
 * handler:
 *
 *   1. Calls `useCreateConversation()` to make
 *      a new conversation server-side.
 *   2. Optimistically writes the user message
 *      into the conversation cache.
 *   3. Sends the WebSocket envelope (the
 *      stream hook in the new view picks it
 *      up after navigate).
 *   4. Navigates to `/chat/{id}`. The
 *      `ConversationView` mounts, the
 *      `useConversationStream` hook acquires
 *      the per-conversation socket, the
 *      `pendingContent` is consumed, and the
 *      assistant response streams in.
 *
 * **Why create-then-send in one go (not send-
 * then-create).** The backend's V3 protocol
 * requires a conversation id before the WS
 * accepts a `message` envelope. The
 * alternative would be a separate
 * "create a message without a conversation"
 * endpoint, which V3 deliberately doesn't
 * expose.
 *
 * **No fake assistant responses.** Until the
 * first token arrives, the streaming slot
 * shows the "Generating…" pill. We never
 * invent placeholder turns.
 */

"use client"

import { useCallback, type ReactNode } from "react"
import { useRouter } from "next/navigation"

import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@cortex/ui"

import { ChatLayout } from "@/components/chat/ChatLayout"
import { useCreateConversation, useSendMessage } from "@/hooks/chat"
import { sendMessage as sendMessageService } from "@/services/conversations"
import type { Conversation, Message } from "@/types/conversation"
import { ApiError } from "@cortex/api-client"

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
    agentRunId: null,
    modelName: null,
    createdAt: new Date().toISOString(),
  }
}

export function ChatView(): ReactNode {
  const router = useRouter()
  const qc = useQueryClient()
  const create = useCreateConversation()
  // The mutation needs a conversationId. We
  // bind it to a sentinel "" — the mutation
  // isn't called on this view; the send
  // handler below orchestrates create +
  // manual optimistic patch + WS send.
  const send = useSendMessage({ conversationId: "" })

  const handleSend = useCallback(
    async (value: string) => {
      if (!value.trim()) return
      if (create.isPending || send.isPending) return
      try {
        // Step 1: create the conversation.
        const conversation = await create.mutateAsync({
          title: "New conversation",
        })
        // Step 2: optimistically patch the
        // user message into the new
        // conversation's cache so it's
        // visible the moment the new view
        // mounts.
        const optimistic = makeOptimisticUserMessage(
          conversation.id,
          value,
        )
        qc.setQueryData<Conversation>(
          ["conversations", conversation.id],
          (prev) => {
            if (prev) {
              return {
                ...prev,
                messages: [...(prev.messages ?? []), optimistic],
              }
            }
            // No prior cache (expected — fresh
            // conversation). Synthesize a
            // minimal Conversation row so the
            // list cache + the empty-state
            // path work consistently.
            return {
              id: conversation.id,
              tenantId: conversation.tenantId,
              userId: conversation.userId,
              title: conversation.title,
              summary: conversation.summary,
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt,
              messages: [optimistic],
            }
          },
        )
        // Step 3: fire the WS send. This
        // initializes the stream store; the
        // stream hook in the new view picks
        // it up and drives the socket.
        sendMessageService({
          conversationId: conversation.id,
          content: value,
          userMessageId: optimistic.id,
        })
        // Step 4: navigate. The new view
        // acquires the WS socket + sends the
        // queued `pendingContent`.
        router.push(`/chat/${conversation.id}` as never)
      } catch (err) {
        const message =
          err instanceof ApiError
            ? (err.body as { message?: string } | undefined)?.message ??
              "Couldn't start the conversation."
            : err instanceof Error
              ? err.message
              : "Couldn't start the conversation."
        toast({
          title: "Couldn't send your message",
          description: message,
          variant: "destructive",
        })
      }
    },
    [create, send.isPending, qc, router],
  )

  return (
    <ChatLayout
      title={null}
      messages={[]}
      conversationId="new"
      onSend={handleSend}
      isBusy={create.isPending || send.isPending}
    />
  )
}
