/**
 * ConversationList — the scrollable list of
 * `ConversationListItem` rows + the matching
 * empty / loading / error / success states.
 *
 * **F5 Part 1 (Task 8).** The list is a "dumb"
 * component: it receives the query result via
 * props and renders the four states. The data
 * fetch lives in the parent (`ConversationHistory`)
 * so the same list shape can be reused for
 * future surfaces (search results, archived
 * conversations in Part 2).
 *
 * **States.**
 *   - Loading: layout-stable Skeleton rows.
 *   - Error: friendly copy + Retry (calls
 *     `onRetry` which re-fetches the parent
 *     query).
 *   - Empty: friendly copy + "Start a
 *     conversation" CTA (delegated to the
 *     parent so the same createConversation
 *     flow is used).
 *   - Success: the rows. Scrollable, with the
 *     active item always in view.
 *
 * **No local state.** The list is a pure
 * projection of the parent's query. The
 * "scrolling to keep the active row in view"
 * behaviour lives in the parent — this
 * component just renders.
 *
 * **Truncation.** Items handle their own title
 * truncation. The list container has a max
 * height (set in the parent) and a thin scrollbar.
 */

import type { ReactNode } from "react"

import { Button, Icon, Skeleton } from "@cortex/ui"

import { ConversationListItem } from "./ConversationListItem"
import type { Conversation } from "@/types/conversation"

export interface ConversationListItemRowProps {
  isRenaming: boolean
  isDeleting: boolean
  renameError: string | null
  deleteError: string | null
  onRenameSubmit: (title: string) => void
  onDeleteConfirm: () => void
}

export interface ConversationListProps {
  conversations: Conversation[] | undefined
  /** True while the underlying query is loading. */
  isLoading: boolean
  /** Error from the query, if any. */
  error: Error | null
  /** Active conversation id (from the route). */
  activeConversationId: string | null
  /**
   * Refetch the list. Provided by the parent so
   * the list doesn't need to know about the
   * underlying query.
   */
  onRetry: () => void
  /**
   * Start a new conversation. The parent owns
   * the createConversation mutation + the
   * router.push; the list just exposes the
   * CTA so the empty state has an action.
   */
  onStartConversation: () => void
  /**
   * Per-conversation row props (rename +
   * delete state + callbacks). The parent
   * owns the mutations; the list just threads
   * the per-id props through. A conversation
   * without an entry here renders in
   * `isRenaming=false, isDeleting=false,
   * renameError=null, deleteError=null`
   * — the "Normal" sub-state only.
   */
  itemPropsById?: Map<string, ConversationListItemRowProps>
  className?: string
}

const SKELETON_ROWS = 6

export function ConversationList({
  conversations,
  isLoading,
  error,
  activeConversationId,
  onRetry,
  onStartConversation,
  itemPropsById,
  className,
}: ConversationListProps): ReactNode {
  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading conversations"
        data-conversation-list="loading"
        className={
          "flex flex-col gap-1.5 px-1.5 py-2 " + (className ?? "")
        }
      >
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <div
            key={i}
            data-skeleton-row
            className="flex flex-col gap-1.5 rounded-md px-2.5 py-2"
          >
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-3.5 w-3.5 rounded-full" />
              <Skeleton className="h-3.5 w-3/4" />
            </div>
            <Skeleton className="ml-5 h-2.5 w-1/3" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div
        role="alert"
        data-conversation-list="error"
        className={
          "flex flex-col items-center gap-3 px-3 py-6 text-center " +
          (className ?? "")
        }
      >
        <div
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10 text-destructive"
        >
          <Icon name="TriangleAlert" className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            Couldn't load conversations
          </p>
          <p className="mx-auto max-w-[28ch] text-xs text-muted-foreground">
            {error.message || "Check your connection and try again."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="h-7"
        >
          <Icon name="RefreshCw" className="h-3.5 w-3.5" />
          <span>Try again</span>
        </Button>
      </div>
    )
  }

  if (!conversations || conversations.length === 0) {
    return (
      <div
        role="status"
        data-conversation-list="empty"
        className={
          "flex flex-col items-center gap-3 px-3 py-6 text-center " +
          (className ?? "")
        }
      >
        <div
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon name="MessageSquare" className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            No conversations yet
          </p>
          <p className="mx-auto max-w-[28ch] text-xs text-muted-foreground">
            Start your first conversation to see it here.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onStartConversation}
          className="h-7"
        >
          <Icon name="Plus" className="h-3.5 w-3.5" />
          <span>Start a conversation</span>
        </Button>
      </div>
    )
  }

  return (
    <ul
      role="list"
      data-conversation-list="ready"
      className={
        "flex flex-col gap-0.5 px-1.5 py-1 " + (className ?? "")
      }
    >
      {conversations.map((c) => {
        const rowProps = itemPropsById?.get(c.id)
        return (
          <li key={c.id} className="min-w-0">
            <ConversationListItem
              conversation={c}
              activeConversationId={activeConversationId}
              isRenaming={rowProps?.isRenaming ?? false}
              isDeleting={rowProps?.isDeleting ?? false}
              renameError={rowProps?.renameError ?? null}
              deleteError={rowProps?.deleteError ?? null}
              onRenameSubmit={rowProps?.onRenameSubmit}
              onDeleteConfirm={rowProps?.onDeleteConfirm}
            />
          </li>
        )
      })}
    </ul>
  )
}
