/**
 * MessageBubble — a single user/assistant/tool
 * message in the conversation.
 *
 * **F4 Part 1 (Task 11) + Part 3.** Three roles:
 *   - `user`      — right-aligned, accent-on-mist
 *   - `assistant` — left-aligned, plain slate
 *   - `tool`      — left-aligned, monospaced
 *
 * **Citation chips.** Assistant messages
 * with `retrievedChunkIds` render an
 * inline chip rail at the end of the
 * content. Each chip opens the citation
 * panel via the global panel store. The
 * chips are real — they only render when
 * the resolver has produced a citation
 * (no fake markers, Task 40).
 *
 * **Why chips at the end (not inline in
 * the text).** The V3 backend does not
 * insert `[1] [2] [3]` markers into the
 * assistant text — the citation events
 * arrive as separate envelopes with their
 * own order. Future V4 may add inline
 * markers (the spec's "Markdown / rich
 * answer interaction" path), at which
 * point we extend the bubble to render
 * markers inline. Today's chips are the
 * safe, traceable shape: every visible
 * marker corresponds to a real chunk.
 *
 * **Whitespace.** Message content is
 * pre-wrapped text. The streaming message
 * (Part 2) appends to the same `<p>`.
 *
 * **Accessibility.** Each bubble is a
 * `<article>` with `aria-label` that
 * includes the role + a timestamp. Screen
 * readers announce "user message, 3
 * minutes ago" etc.
 */

import type { ReactNode } from "react"

import { cn } from "@cortex/ui"

import { CitationChip } from "./citations/CitationChip"
import { useCitationPanelStore } from "@/hooks/chat"
import { useResolvedCitations } from "@/hooks/chat/useResolvedCitations"

import type { Message, MessageRole } from "@/types/conversation"

export interface MessageBubbleProps {
  message: Message
  /**
   * Conversation id — used by the citation
   * resolver to look up streamed citation
   * data. Required because the resolver
   * needs both the message's chunk ids
   * AND the stream store's accumulated
   * citation envelopes.
   */
  conversationId: string
  className?: string
}

const ROLE_STYLES: Record<MessageRole, string> = {
  user: "ml-auto max-w-2xl rounded-2xl bg-ember-500/15 px-4 py-2.5 text-foreground border border-ember-500/30",
  assistant:
    "mr-auto max-w-2xl rounded-2xl bg-card px-4 py-2.5 text-foreground border border-border",
  tool: "mr-auto max-w-2xl rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground border border-border",
}

const ROLE_LABEL: Record<MessageRole, string> = {
  user: "You",
  assistant: "Assistant",
  tool: "Tool",
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function MessageBubble({
  message,
  conversationId,
  className,
}: MessageBubbleProps): ReactNode {
  const style = ROLE_STYLES[message.role]
  const label = ROLE_LABEL[message.role]
  const { data: citations } = useResolvedCitations(
    message,
    conversationId,
  )
  const selectedCitationId = useCitationPanelStore(
    (s) => s.selectedCitationId,
  )
  // Only assistant messages show
  // citations. The resolver still runs
  // for user / tool but returns [].
  const showChips =
    message.role === "assistant" && citations.length > 0
  return (
    <article
      aria-label={`${label} message at ${formatTime(message.createdAt) || "unknown time"}`}
      className={cn("w-fit", style, className)}
      data-role={message.role}
      data-message-id={message.id}
    >
      <div
        className={cn(
          "mb-1 text-[10px] font-semibold uppercase tracking-wide",
          message.role === "user"
            ? "text-ember-700"
            : message.role === "tool"
              ? "text-muted-foreground"
              : "text-foreground/70",
        )}
      >
        {label}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {message.content}
      </p>
      {showChips ? (
        <div
          className="mt-2 flex flex-wrap items-center gap-1.5"
          data-citation-rail
          data-citation-count={citations.length}
        >
          {citations.map((c) => (
            <CitationChip
              key={c.id}
              id={c.id}
              index={c.index}
              documentTitle={c.documentTitle}
              isActive={selectedCitationId === c.id}
            />
          ))}
        </div>
      ) : null}
    </article>
  )
}
