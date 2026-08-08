/**
 * ChatLayout — the three-row composition:
 *   - ConversationHeader
 *   - MessageList (flex-1)
 *   - MessageInput (pinned to the bottom)
 *
 * **F4 Part 1 (Task 8).** This is the visual
 * container. The page routes own the data +
 * mutations; this component only arranges the
 * chrome. That separation lets the same layout
 * be reused by the future F5 conversation list
 * (which will own its own data + selection
 * state).
 *
 * **Responsive.** Single column at every
 * breakpoint. The 320px citation panel (Part 3)
 * is not yet reserved — Part 3 will introduce
 * a two-column variant of this layout.
 *
 * **Height.** The outer container is `flex
 * flex-col h-full` so the message list can claim
 * the remaining height between header + input.
 * The (app) layout's `<main>` already provides
 * the viewport height.
 *
 * **The input is wired with a no-op submit in
 * Part 1.** Part 2 will thread the real
 * mutation + WebSocket flow.
 */

"use client"

import { useState, type ReactNode } from "react"

import type { Message } from "@/types/conversation"

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
  /** Called when the user submits a non-empty
   *  message. Part 1 wires this to a no-op toast
   *  so the input is exercisable; Part 2 wires it
   *  to the real POST + WS flow. */
  onSend?: (value: string) => void
}

export function ChatLayout({
  title,
  messages = [],
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
      <MessageList messages={messages} />
      <MessageInput
        value={draft}
        onChange={setDraft}
        onSubmit={handleSend}
      />
    </div>
  )
}
