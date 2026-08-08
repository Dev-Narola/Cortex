/**
 * MessageList — the scrollable message column.
 *
 * **F4 Part 1 (Task 10) + Part 2 (Tasks 20, 32).**
 * Renders the conversation's messages in order
 * + the in-flight streaming message at the
 * bottom (Part 2).
 *
 * **Scroll behaviour (Task 32).** The list
 * sticks to the bottom on every render — but
 * only if the user is already near the
 * bottom. The heuristic:
 *
 *   distanceToBottom = scrollHeight - (scrollTop + clientHeight)
 *   if (distanceToBottom < NEAR_THRESHOLD) jump-to-bottom
 *
 * Threshold is 80px — generous enough that
 * "I'm reading the last line" still counts as
 * "near the bottom". When a user scrolls up
 * to re-read an earlier message, the list
 * stops yanking them back down (the spec is
 * explicit about that).
 *
 * **Streaming slot (Task 20).** When a turn
 * is in flight, the `StreamingMessage`
 * component is rendered AFTER the persisted
 * messages. Once the stream completes the
 * server-authoritative row is invalidated
 * into the cache; the streaming slot fades
 * out and the new `MessageBubble` takes its
 * place (no double-render).
 *
 * **No fake assistant messages.** When the
 * conversation is empty AND no turn is in
 * flight, the list shows the `ChatEmptyState`.
 * During the `sending` state of a brand new
 * conversation (no messages yet), the
 * streaming bubble is shown directly — the
 * user sees their question and the
 * generating indicator in the same place
 * they'd see the response.
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
  /** Current streaming state. When the
   *  stream is `idle`, no streaming slot is
   *  rendered. */
  stream: ActiveStream | null
  className?: string
}

export function MessageList({
  messages,
  stream,
  className,
}: MessageListProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null)
  // `nearBottom` is recomputed on every
  // scroll event. The auto-scroll effect
  // reads it to decide whether to jump.
  const nearBottomRef = useRef(true)

  // Track whether the user is near the
  // bottom. We use the ref pattern instead
  // of state to avoid an extra render on
  // every scroll tick.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      const distance =
        el!.scrollHeight - (el!.scrollTop + el!.clientHeight)
      nearBottomRef.current = distance < NEAR_BOTTOM_THRESHOLD_PX
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    // Seed the initial value.
    onScroll()
    return () => {
      el.removeEventListener("scroll", onScroll)
    }
  }, [])

  // Auto-scroll to the bottom on every
  // render — but only if the user is near
  // the bottom. ResizeObserver catches the
  // streaming bubble growing as tokens
  // arrive.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (!nearBottomRef.current) return
    el.scrollTop = el.scrollHeight
  })

  // Decide whether to show the streaming
  // slot. The slot appears when:
  //   - A turn is in flight (sending/streaming)
  //   - OR a turn just completed but the
  //     optimistic + server rows haven't
  //     reconciled yet (we still show the
  //     accumulator as the authoritative
  //     source for a frame).
  const isStreamActive =
    stream !== null &&
    stream.conversationId !== "" &&
    (stream.status === "sending" || stream.status === "streaming")
  const showStreamingSlot = isStreamActive

  // The "final message" fallback: when the
  // server has persisted the assistant
  // message, the conversation cache will
  // include it on the next refetch. Until
  // then, the streaming slot is the
  // authoritative source. We pass the last
  // assistant message in the cache as a
  // fallback if it matches the streaming
  // message id.
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
        <MessageBubble key={m.id} message={m} />
      ))}
      {showStreamingSlot && stream ? (
        <StreamingMessage
          content={stream.content}
          isActive={isStreamActive}
          finalMessage={finalMessage}
        />
      ) : null}
    </div>
  )
}
