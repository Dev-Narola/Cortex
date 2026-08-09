/**
 * MessageList — F4 Part 1 + 2 + 3.
 *
 * Renders the conversation's messages in
 * order + the in-flight streaming message
 * at the bottom.
 *
 * **Conversation id threading (F4 Part 3).**
 * The list forwards its `conversationId`
 * to each `MessageBubble` and to the
 * `StreamingMessage`. Both call the
 * `useResolvedCitations` hook with the id
 * so the citation resolver can look up
 * streamed citations in the per-conversation
 * store.
 *
 * **Scroll behaviour (Task 32).** Sticks
 * to the bottom only when the user is
 * already near it.
 *
 * **Streaming slot (Task 20).** Rendered
 * after the persisted messages when a
 * turn is in flight. Once the server
 * persists the row, the streaming slot
 * hands off to the normal bubble.
 *
 * **No fake assistant messages.** Empty
 * conversation + no active stream →
 * `ChatEmptyState`.
 */

"use client"

import { useEffect, useRef, type ReactNode } from "react"

import { ChatEmptyState } from "./ChatEmptyState"
import { MessageBubble } from "./MessageBubble"
import { StreamingMessage } from "./StreamingMessage"
import type { Message } from "@/types/conversation"
import type { ActiveStream } from "@/hooks/chat/conversationStreamStore"

const NEAR_BOTTOM_THRESHOLD_PX = 80

export interface MessageListProps {
  messages: Message[]
  /** Current streaming state. */
  stream: ActiveStream | null
  /**
   * Conversation id — forwarded to each
   * `MessageBubble` so the citation
   * resolver can find the streamed
   * citations in the store.
   */
  conversationId: string
  className?: string
}

export function MessageList({
  messages,
  stream,
  conversationId,
  className,
}: MessageListProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      const distance =
        el!.scrollHeight - (el!.scrollTop + el!.clientHeight)
      nearBottomRef.current = distance < NEAR_BOTTOM_THRESHOLD_PX
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => {
      el.removeEventListener("scroll", onScroll)
    }
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (!nearBottomRef.current) return
    el.scrollTop = el.scrollHeight
  })

  const isStreamActive =
    stream !== null &&
    stream.conversationId !== "" &&
    (stream.status === "sending" || stream.status === "streaming")
  const showStreamingSlot = isStreamActive

  const finalMessage =
    !isStreamActive && stream?.assistantMessageId
      ? (messages.find((m) => m.id === stream.assistantMessageId) ?? null)
      : null

  if (messages.length === 0 && !showStreamingSlot) {
    return (
      <div
        ref={scrollRef}
        className={
          "flex flex-1 flex-col overflow-y-auto " + (className ?? "")
        }
      >
        <ChatEmptyState />
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className={
        "flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6 " +
        (className ?? "")
      }
      aria-label="Conversation messages"
    >
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          conversationId={conversationId}
        />
      ))}
      {showStreamingSlot && stream ? (
        <StreamingMessage
          content={stream.content}
          isActive={isStreamActive}
          conversationId={conversationId}
          retrievedChunkIds={[]}
          finalMessage={finalMessage}
        />
      ) : null}
    </div>
  )
}
