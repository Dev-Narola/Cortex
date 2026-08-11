/**
 * ConversationListItem — one row in the
 * conversation history list.
 *
 * **F5 Part 1 (Task 9).** A single clickable row
 * that links to the conversation. Renders the
 * server-provided title (no client-side title
 * generation in Part 1).
 *
 * **Active state.** When the row's id matches
 * `activeConversationId`, a left Ember bar +
 * tinted background marks the selection. The
 * style reuses the existing void/slate/paper
 * token set; no new colour is introduced.
 *
 * **Truncation.** Long titles collapse to one
 * line with `text-ellipsis`. The full title is
 * in the `title` attribute (native tooltip) +
 * the accessible name (screen readers still
 * get the full text).
 *
 * **Accessibility (Task 31).**
 *   - Native `<a href="/chat/{id}">` so middle-click,
 *     cmd-click, and "open in new tab" all work
 *     — exactly how a ChatGPT-style history
 *     behaves.
 *   - `aria-current="page"` when active so AT
 *     announces the selection.
 *   - The timestamp is the secondary line; it's
 *     in `muted-foreground` and machine-readable
 *     via the ISO string.
 *
 * **No fetch / no store.** Pure UI. The parent
 * provides the data.
 */

import type { ReactNode } from "react"

import { Icon, cn } from "@cortex/ui"

import type { Conversation } from "@/types/conversation"

export interface ConversationListItemProps {
  conversation: Conversation
  /** The conversation id currently open in the main pane. */
  activeConversationId: string | null
  className?: string
}

/**
 * Format an ISO timestamp as a short relative date
 * suitable for the secondary line. Examples:
 *   - "Just now" for < 60s
 *   - "5m ago", "2h ago", "Yesterday", "Mar 14"
 */
function formatRelative(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const now = Date.now()
  const diffMs = now - d.getTime()
  if (diffMs < 0) {
    // Clock skew or future-dated row. Show the
    // short calendar date.
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })
  }
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return "Just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function ConversationListItem({
  conversation,
  activeConversationId,
  className,
}: ConversationListItemProps): ReactNode {
  const isActive = conversation.id === activeConversationId
  const href = `/chat/${encodeURIComponent(conversation.id)}` as never
  return (
    <a
      href={href}
      aria-current={isActive ? "page" : undefined}
      data-active={isActive ? "true" : "false"}
      data-conversation-id={conversation.id}
      title={conversation.title}
      className={cn(
        "group relative flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500/40",
        isActive
          ? "bg-ember-500/10 text-foreground"
          : "text-foreground/80",
        className,
      )}
    >
      {/* Active rail. Always rendered so the
          layout doesn't reflow when the active
          conversation changes. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-ember-500 transition-opacity",
          isActive ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon
          name="MessageSquare"
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isActive ? "text-ember-600" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <span
          data-conversation-title
          className="min-w-0 flex-1 truncate font-medium"
        >
          {conversation.title}
        </span>
      </span>
      <span className="ml-5 truncate text-[10px] text-muted-foreground tabular-nums">
        {formatRelative(conversation.updatedAt)}
      </span>
    </a>
  )
}
