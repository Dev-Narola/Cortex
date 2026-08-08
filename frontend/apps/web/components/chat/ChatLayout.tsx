/**
 * ChatLayout — the three-row composition:
 *   - ConversationHeader
 *   - MessageList (flex-1)
 *   - MessageInput (pinned to the bottom)
 *
 * **F4 Part 1 (Task 8) + Part 2.** This is the
 * visual container. The page routes own the
 * data + mutations; this component only
 * arranges the chrome.
 *
 * **Streaming (Part 2).** The component now
 * takes an `ActiveStream` so the message list
 * can render the in-flight streaming slot.
 * It also passes `isBusy` to the input — the
 * input disables Send while a turn is in
 * flight (Task 24).
 *
 * **The Send handler.** The parent page wires
 * the real mutation + WebSocket flow. This
 * component only forwards.
 *
 * **Responsive.** Single column at every
 * breakpoint. The 320px citation panel (Part 3)
 * is not yet reserved.
 */

"use client"

import { useState, type ReactNode } from "react"

import type { Message } from "@/types/conversation"
import type { ActiveStream } from "@/hooks/chat/conversationStreamStore"

import { ConversationHeader } from "./ConversationHeader"
import { MessageInput } from "./MessageInput"
import { MessageList } from "./MessageList"

export interface ChatLayoutProps {
  /** Conversation title (server-owned). */
  title?: string | null
  /** Conversation messages (server-owned). May be
   *  empty — the layout renders the empty state
   *  in that case. */
  messages?: Message[]
  /**
   * Active stream for the conversation. Pass
   * `null` when the page has no id yet (the
   * new-conversation flow before the first
   * message is sent). The MessageList uses
   * this to render the streaming slot.
   */
  stream?: ActiveStream | null
  /**
   * `true` while a turn is in flight. The
   * input disables Send; the layout could
   * also show a subtle "Generation in
   * progress" affordance in the future.
   */
  isBusy?: boolean
  /** Called when the user submits a non-empty
   *  message. The parent wires the real flow. */
  onSend?: (value: string) => void
}

export function ChatLayout({
  title,
  messages = [],
  stream = null,
  isBusy = false,
  onSend,
}: ChatLayoutProps): ReactNode {
  const [draft, setDraft] = useState("")

  function handleSend(value: string) {
    if (!value) return
    onSend?.(value)
    setDraft("")
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConversationHeader title={title} />
      <MessageList messages={messages} stream={stream} />
      <MessageInput
        value={draft}
        onChange={setDraft}
        onSubmit={handleSend}
        disabled={isBusy}
        placeholder={
          isBusy
            ? "Cortex is generating a response…"
            : "Ask something about your knowledge base…"
        }
      />
    </div>
  )
}
