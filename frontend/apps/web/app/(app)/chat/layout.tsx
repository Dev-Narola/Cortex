/**
 * Chat route — `(app)/chat/layout.tsx`.
 *
 * **F5 Part 1 (Task 14).** The shared layout for
 * `/chat` (no id, the empty state) and
 * `/chat/[conversationId]` (the active
 * conversation). Renders the left-hand
 * `ConversationHistory` pane + the right-hand
 * main content area.
 *
 * **Why a layout (not per-page duplication).**
 * The history pane is the same on both routes.
 * A shared layout keeps the data layer
 * (`useConversations`) mounted exactly once +
 * the in-view scroll effect runs continuously
 * across route changes. Two separate pages
 * would have unmounted + remounted the history
 * on every navigation, which would lose the
 * "scroll the active row into view" effect.
 *
 * **Server vs client.** The whole shell is
 * client-rendered (it reads the route + the
 * auth store). The server entry only knows the
 * static shell; the per-page `page.tsx` files
 * own the data fetching for the right pane.
 *
 * **Mobile behaviour (Task 24).** On
 * viewports `< md` the history pane collapses
 * into a slide-over drawer (controlled by the
 * URL search param `?history=1`). The right
 * pane occupies the full width by default. The
 * drawer is a follow-up; Part 1 ships the
 * desktop layout + the underlying hook so the
 * mobile experience is one CSS toggle away.
 */

"use client"

import type { ReactNode } from "react"

import { ConversationHistory } from "@/components/chat/history/ConversationHistory"

export default function ChatLayout({
  children,
}: {
  children: ReactNode
}): ReactNode {
  return (
    <div
      data-chat-shell
      className="flex h-full min-h-0 w-full"
    >
      {/* Desktop history pane. Hidden on mobile
          via the `hidden md:flex` pair — the
          mobile drawer is a follow-up; Part 1
          ships the desktop layout + the data
          layer. */}
      <div
        data-chat-history-slot
        className="hidden w-72 shrink-0 md:flex md:w-80 lg:w-96"
      >
        <ConversationHistory className="w-full" />
      </div>
      {/* Main pane. The page components own the
          ChatLayout (F4 composer) inside. */}
      <div
        data-chat-main
        className="flex min-w-0 flex-1 flex-col"
      >
        {children}
      </div>
    </div>
  )
}
