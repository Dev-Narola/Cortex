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

import type { ReactNode } from "react"

import { ChatLayout } from "@/components/chat/ChatLayout"
import { useStartConversation } from "@/hooks/chat"

export function ChatView(): ReactNode {
  const { start, isPending } = useStartConversation()
  return (
    <ChatLayout
      title={null}
      messages={[]}
      conversationId="new"
      onSend={(value) => void start(value)}
      isBusy={isPending}
    />
  )
}
