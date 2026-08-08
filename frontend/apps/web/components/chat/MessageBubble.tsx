/**
 * MessageBubble — a single user/assistant/tool
 * message in the conversation.
 *
 * **F4 Part 1 (Task 11).** Three roles:
 *   - `user`      — right-aligned, accent-on-mist
 *   - `assistant` — left-aligned, plain slate
 *   - `tool`      — left-aligned, monospaced (a
 *                   future agent trace; the spec
 *                   keeps the role in the type
 *                   model even if the UI is minimal)
 *
 * **No fake streaming, no fake citations, no
 * action buttons.** Those are F4 Part 2 +
 * Part 3 + Part 4 respectively.
 *
 * **Whitespace.** Message content is rendered as
 * pre-wrapped text. The future streaming message
 * (Part 2) will append to the same `<p>` node.
 *
 * **Accessibility.** Each bubble is a `<article>`
 * with `aria-label` that includes the role + a
 * timestamp. Screen readers announce "user
 * message, 3 minutes ago" etc.
 */

import type { ReactNode } from "react"

import { cn } from "@cortex/ui"

import type { Message, MessageRole } from "@/types/conversation"

export interface MessageBubbleProps {
  message: Message
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
  className,
}: MessageBubbleProps): ReactNode {
  const style = ROLE_STYLES[message.role]
  const label = ROLE_LABEL[message.role]
  return (
    <article
      aria-label={`${label} message at ${formatTime(message.createdAt) || "unknown time"}`}
      className={cn("w-fit", style, className)}
      data-role={message.role}
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
    </article>
  )
}
