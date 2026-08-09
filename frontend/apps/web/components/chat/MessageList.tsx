/**
 * MessageList — F4 Part 1 + 2 + 3 + 4.
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
 * **Action row + preceding message (F4 Part 4,
 * Task 76).** Each `MessageBubble` needs the
 * text of the preceding user message to
 * power Regenerate. The list walks the
 * `messages` array once and threads the
 * predecessor through.
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

import { useEffect, useMemo, useRef, type ReactNode } from "react"

import { ChatEmptyState } from "./ChatEmptyState"
import { InterruptedBanner } from "./InterruptedBanner"
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
  /** True while a turn is in flight —
   *  bubbles hide their action row. */
  isBusy: boolean
  className?: string
}

export function MessageList({
  messages,
  stream,
  conversationId,
  isBusy,
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
  const isInterrupted = stream?.status === "interrupted"

  const finalMessage =
    !isStreamActive && stream?.assistantMessageId
      ? (messages.find((m) => m.id === stream.assistantMessageId) ?? null)
      : null

  // Pre-compute the predecessor for every
  // message in a single pass. The list is
  // small (a chat is tens, not thousands, of
  // rows) and the recompute only happens on
  // message add / stream complete. We pass the
  // actual preceding user's `content` (not
  // the whole row) to the bubble — the row
  // already lives in the list.
  const precedingTextByMessageId = useMemo(() => {
    const map = new Map<string, string>()
    let lastUserContent: string | null = null
    for (const m of messages) {
      if (m.role === "user") {
        lastUserContent = m.content
      } else if (m.role === "assistant") {
        if (lastUserContent !== null) {
          map.set(m.id, lastUserContent)
        }
      }
    }
    return map
  }, [messages])

  // F4 Part 4 (Task 94 + 95): when the WS
  // dropped mid-turn we want to render the
  // banner under the streaming slot. The
  // banner needs the last user message's
  // content (to feed Retry).
  const lastUserContent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i]
      if (m && m.role === "user") return m.content
    }
    // Fall back to the optimistic content the
    // stream store is holding — that handles
    // the case where the WS died before the
    // user message was persisted.
    return stream?.pendingContent ?? null
  }, [messages, stream?.pendingContent])

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
          isBusy={isBusy}
          precedingUserMessage={
            m.role === "assistant"
              ? (precedingTextByMessageId.get(m.id) ?? null)
              : null
          }
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
      {isInterrupted && lastUserContent ? (
        <InterruptedBanner
          conversationId={conversationId}
          content={lastUserContent}
        />
      ) : null}
    </div>
  )
}
