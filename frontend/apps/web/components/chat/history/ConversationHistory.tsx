/**
 * ConversationHistory — the left-hand history pane
 * (F5 Part 1, Task 7).
 *
 * **Container responsibilities.**
 *   1. Owns the `useConversations` query (so
 *      other surfaces — search, archive — can
 *      mount the same data layer later).
 *   2. Composes the title row, the "+ New chat"
 *      CTA, and the `ConversationList`.
 *   3. Knows the active conversation id (from
 *      the route via `useParams`).
 *   4. Exposes a `refetch` handle that the list
 *      can call from its error state.
 *   5. Scrolls the active item into view when
 *      the route changes.
 *
 * **Why the container owns the data layer.** The
 * list is intentionally a "dumb" component
 * (Tasks 8 + 32). The query lives here so a
 * future search / archive surface can mount
 * the same `useConversations` and reuse the
 * `ConversationList` unchanged.
 *
 * **The "active item always in view" detail.**
 * When the user navigates to a different
 * conversation from somewhere other than the
 * list itself (the URL bar, the dashboard
 * quick action, a deep link), the list
 * shouldn't land with the active row scrolled
 * out of view. The effect below observes
 * the active id + the query data and scrolls
 * the row into view.
 *
 * **Mobile drawer integration.** The container
 * accepts an `onNavigate` callback that the
 * `NewConversationButton` + the `ConversationList`
 * trigger. The parent (a future `ChatSidebar` on
 * `(app)/chat/page.tsx`) can use it to dismiss
 * the mobile drawer before the route
 * transition lands. Part 1 wires the callback
 * when the mobile drawer is added.
 */

"use client"

import { useParams, usePathname } from "next/navigation"
import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react"

import { Icon, cn } from "@cortex/ui"

import { useConversations } from "@/hooks/chat"
import type { Conversation } from "@/types/conversation"

import { ConversationList } from "./ConversationList"
import { NewConversationButton } from "./NewConversationButton"

export interface ConversationHistoryProps {
  /**
   * Callback fired when the user navigates
   * (either via the list or via "New chat").
   * The parent typically uses this to close
   * the mobile drawer.
   */
  onNavigate?: () => void
  className?: string
}

export function ConversationHistory({
  onNavigate,
  className,
}: ConversationHistoryProps): ReactNode {
  const params = useParams<{ conversationId?: string }>()
  const pathname = usePathname()
  const activeConversationId = params?.conversationId ?? null

  const query = useConversations({ limit: 50 })
  const listRef = useRef<HTMLDivElement>(null)

  const handleRetry = useCallback(() => {
    void query.refetch()
  }, [query])

  const handleStartConversation = useCallback(() => {
    onNavigate?.()
    // The button itself runs the create
    // mutation + router.push; this callback
    // is only the side-channel for the
    // "list empty" CTA which delegates to
    // the same hook via the button below.
  }, [onNavigate])

  // Scroll the active item into view when the
  // route changes OR when the list data lands
  // for the first time.
  useEffect(() => {
    if (!listRef.current || !activeConversationId) return
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-conversation-id="${CSS.escape(activeConversationId)}"]`,
    )
    if (!el) return
    el.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [activeConversationId, pathname, query.data])

  // Items the list should render. We hand the
  // list the `data` (or undefined while
  // loading) + the four-state shape; the list
  // owns its own loading/empty/error/success UI.
  const conversations: Conversation[] | undefined = query.data?.items

  return (
    <aside
      aria-label="Conversation history"
      data-conversation-history
      className={cn(
        "flex h-full min-h-0 flex-col gap-1 border-r border-border bg-card/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon
            name="MessagesSquare"
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <h2
            className="truncate font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            data-history-header
          >
            Conversations
          </h2>
        </div>
        <NewConversationButton
          variant="default"
          size="sm"
          className="h-7"
          {...(onNavigate ? { onAfterCreate: onNavigate } : {})}
        />
      </div>
      <div
        ref={listRef}
        data-history-list-scroll
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <ConversationList
          conversations={conversations}
          isLoading={query.isLoading}
          error={query.error}
          activeConversationId={activeConversationId}
          onRetry={handleRetry}
          onStartConversation={handleStartConversation}
        />
      </div>
    </aside>
  )
}
