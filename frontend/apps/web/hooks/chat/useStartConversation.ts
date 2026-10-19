/**
 * useStartConversation — create a conversation and ask its first question.
 *
 * Shared by `/chat` (empty composer) and the dashboard's Ask bar:
 *   1. POST /conversations.
 *   2. Optimistically write the user message into the new conversation's cache.
 *   3. Queue the WebSocket send (the stream hook in the new view picks it up).
 *   4. Navigate to /chat/{id}, where the answer streams in.
 *
 * Failures surface as a toast; nothing is faked. `isPending` covers the
 * create step so callers can block duplicate submits.
 */

"use client"

import { ApiError } from "@cortex/api-client"
import { toast } from "@cortex/ui"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback } from "react"

import { sendMessage as sendMessageService } from "@/services/conversations"
import type { Conversation, Message } from "@/types/conversation"

import { useCreateConversation } from "./useCreateConversation"

function makeOptimisticUserMessage(conversationId: string, content: string): Message {
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

export function useStartConversation(): {
  start: (question: string) => Promise<void>
  isPending: boolean
} {
  const router = useRouter()
  const qc = useQueryClient()
  const create = useCreateConversation()

  const start = useCallback(
    async (question: string) => {
      const value = question.trim()
      if (!value || create.isPending) return
      try {
        const conversation = await create.mutateAsync({ title: "New conversation" })
        const optimistic = makeOptimisticUserMessage(conversation.id, value)
        qc.setQueryData<Conversation>(["conversations", conversation.id], (prev) =>
          prev
            ? { ...prev, messages: [...(prev.messages ?? []), optimistic] }
            : {
                id: conversation.id,
                tenantId: conversation.tenantId,
                userId: conversation.userId,
                title: conversation.title,
                summary: conversation.summary,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
                messages: [optimistic],
              },
        )
        sendMessageService({
          conversationId: conversation.id,
          content: value,
          userMessageId: optimistic.id,
        })
        router.push(`/chat/${conversation.id}` as never)
      } catch (err) {
        const message =
          err instanceof ApiError
            ? ((err.body as { message?: string } | undefined)?.message ??
              "Couldn't start the conversation.")
            : err instanceof Error
              ? err.message
              : "Couldn't start the conversation."
        toast({ title: "Couldn't send your message", description: message, variant: "destructive" })
      }
    },
    [create, qc, router],
  )

  return { start, isPending: create.isPending }
}
