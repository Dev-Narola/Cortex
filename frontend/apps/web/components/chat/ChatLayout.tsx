/**
 * ChatLayout — F4 Part 1 + 2 + 3.
 *
 * Composes the chat surface:
 *   - ConversationHeader (top)
 *   - MessageList (flex-1, conversation column)
 *   - CitationPanel (right column, ~320px on
 *     desktop; hidden on mobile until the
 *     user taps a chip, then it overlays the
 *     conversation)
 *   - MessageInput (pinned to the bottom)
 *
 * **Streaming (Part 2).** Threads the
 * `ActiveStream` to the message list so the
 * in-flight streaming slot renders.
 *
 * **Citations (Part 3, Tasks 44, 45, 59).**
 * The layout owns the panel's mount point.
 * The conversation column shrinks to
 * `flex-1`; the citation panel sits in a
 * `w-full md:w-80 lg:w-96` right column
 * (320-384px). On mobile (`< md`) the
 * panel is an absolute overlay over the
 * conversation — the spec calls for an
 * overlay/sheet treatment at narrow
 * viewports, and the conversation
 * remains the primary surface.
 *
 * **The panel is always mounted** so
 * React doesn't re-create the focus trap
 * or escape listener on every open. The
 * `isOpen` flag in the store controls
 * visibility via the `data-citation-panel`
 * attribute. We do not conditionally
 * unmount the panel — the slide-in is
 * cheaper to render than the
 * mount/unmount cost.
 *
 * **The Send handler.** The parent page
 * wires the real mutation + WebSocket
 * flow. This component only forwards.
 */

"use client"

import { useState, type ReactNode } from "react"

import type { Message } from "@/types/conversation"
import type { ActiveStream } from "@/hooks/chat/conversationStreamStore"

import { CitationPanel } from "./citations/CitationPanel"
import { ConversationHeader } from "./ConversationHeader"
import { MessageInput } from "./MessageInput"
import { MessageList } from "./MessageList"

export interface ChatLayoutProps {
  /** Conversation title (server-owned). */
  title?: string | null
  /** Conversation messages (server-owned). */
  messages?: Message[]
  /** Active stream for the conversation. */
  stream?: ActiveStream | null
  /** Conversation id — the citation panel
   *  and each bubble need this for the
   *  resolver. */
  conversationId: string
  /** `true` while a turn is in flight. */
  isBusy?: boolean
  /** Called when the user submits a non-empty
   *  message. */
  onSend?: (value: string) => void
}

export function ChatLayout({
  title,
  messages = [],
  stream = null,
  conversationId,
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
    <div
      className="flex h-full min-h-0 flex-col"
      data-chat-layout
    >
      <ConversationHeader title={title} />
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          data-chat-conversation
        >
          <MessageList
            messages={messages}
            stream={stream}
            conversationId={conversationId}
          />
        </div>
        {/* Citation panel. Always mounted; the
            store's `isOpen` flag drives the
            slide/overlay visibility via the
            `data-citation-panel-state` attribute
            (mobile) and the inline `md:flex`
            (desktop). */}
        <div
          className="absolute inset-0 z-20 flex bg-background md:static md:z-auto md:w-80 md:bg-transparent lg:w-96"
          data-citation-panel-slot
        >
          <CitationPanel
            conversationId={conversationId}
            className="md:rounded-none"
          />
        </div>
      </div>
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
