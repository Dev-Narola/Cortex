/**
 * MessageList — the scrollable message column.
 *
 * **F4 Part 1 (Task 10).** Renders the conversation's
 * messages in order. Empty state surfaces the
 * `ChatEmptyState` (the "Ask anything about your
 * knowledge base" surface).
 *
 * **Scroll behaviour.** The container is a flex
 * column with `overflow-y-auto`; on a new message
 * the list sticks to the bottom. Part 2's streaming
 * message will append to this list (via a TanStack
 * Query cache patch — no manual scroll work).
 *
 * **No fake assistant messages.** If `messages` is
 * empty, the user sees the `ChatEmptyState`. We
 * never invent placeholder turns.
 *
 * **Responsive.** The list is `flex-1` so it fills
 * the available height between the header and the
 * input. Max width on the bubbles (`max-w-2xl` via
 * the bubble) keeps the line length comfortable on
 * 1920px screens.
 */

"use client"

import { useEffect, useRef, type ReactNode } from "react"

import { ChatEmptyState } from "./ChatEmptyState"
import { MessageBubble } from "./MessageBubble"
import type { Message } from "@/types/conversation"

export interface MessageListProps {
  messages: Message[]
  className?: string
}

export function MessageList({
  messages,
  className,
}: MessageListProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Stick to the bottom on every render. Cheap
  // and correct — the list is short (<= a few
  // hundred messages per spec).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  })

  if (messages.length === 0) {
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
    </div>
  )
}
