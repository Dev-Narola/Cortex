/**
 * ConversationHistory — the left-hand history pane
 * (F5 Part 1, Task 7; Part 2 adds rename + delete
 * + the post-delete navigation rule).
 *
 * **Container responsibilities.**
 *   1. Owns the `useConversations` query (so
 *      other surfaces — search, archive — can
 *      mount the same data layer later).
 *   2. Owns the `useRenameConversation` +
 *      `useDeleteConversation` mutations (F5 P2).
 *   3. Composes the title row, the "+ New chat"
 *      CTA, and the `ConversationList`.
 *   4. Knows the active conversation id (from
 *      the route via `useParams`).
 *   5. Exposes a `refetch` handle that the list
 *      can call from its error state.
 *   6. Scrolls the active item into view when
 *      the route changes.
 *   7. Routes the user off a deleted conversation
 *      (Task 30) — see `usePostDeleteNavigation`
 *      below.
 *
 * **Why the container owns the data layer.** The
 * list is intentionally a "dumb" component
 * (Tasks 8 + 32). The query + the mutations
 * live here so a future search / archive
 * surface can mount the same `useConversations`
 * + the same `useRenameConversation` and reuse
 * the `ConversationList` unchanged.
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
 * trigger. The parent (the future mobile
 * drawer wrapper on `(app)/chat/page.tsx`)
 * uses it to dismiss the drawer before the
 * route transition lands. Part 1 wires the
 * callback when the mobile drawer is added.
 *
 * **F5 Part 2 — per-item error tracking.** Each
 * row can be in `renaming` or `deleting` mode
 * (its own local state). When the parent's
 * mutation fails, the item surfaces the
 * error inline (rename → input helper
 * text; delete → confirmation panel). The
 * `errorsByConversationId` map keeps the
 * error state per conversation, so the
 * user can re-edit the same row without
 * the error bleeding across rows.
 */

"use client"

import { useParams, usePathname, useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { Icon, cn } from "@cortex/ui"

import {
  useConversations,
  useDeleteConversation,
  useRenameConversation,
  type UseConversationsResult,
} from "@/hooks/chat/useConversations"
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

interface ItemErrors {
  rename?: string | null
  delete?: string | null
}

/**
 * Pick the next conversation to navigate to
 * after a delete. Rules (Task 30):
 *
 *   1. If the deleted id is NOT the active
 *      conversation, do nothing — the active
 *      route is fine.
 *   2. If the deleted id IS the active
 *      conversation:
 *      a. If another conversation exists in
 *         the updated list, navigate to the
 *         first one.
 *      b. Otherwise, navigate to /chat (the
 *         empty state).
 *
 * The caller is the post-delete effect; we
 * only need the picker here, not the effect.
 */
function pickNextRouteAfterDelete(
  deletedId: string,
  activeId: string | null,
  remaining: Conversation[],
): { kind: "stay" } | { kind: "navigate"; href: string } {
  if (activeId !== deletedId) return { kind: "stay" }
  const next = remaining[0]
  if (next) {
    return {
      kind: "navigate",
      href: `/chat/${encodeURIComponent(next.id)}`,
    }
  }
  return { kind: "navigate", href: "/chat" }
}

export function ConversationHistory({
  onNavigate,
  className,
}: ConversationHistoryProps): ReactNode {
  const params = useParams<{ conversationId?: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const activeConversationId = params?.conversationId ?? null

  const query: UseConversationsResult = useConversations({ limit: 50 })
  const rename = useRenameConversation()
  const deleteMut = useDeleteConversation()
  const listRef = useRef<HTMLDivElement>(null)

  // Per-conversation error state. Keyed by id
  // so re-clicking Rename on the same row
  // shows the same error. Cleared on the next
  // user-driven interaction (rename submit or
  // delete confirm).
  const [errors, setErrors] = useState<Record<string, ItemErrors>>({})

  const handleRetry = useCallback(() => {
    void query.refetch()
  }, [query])

  const handleStartConversation = useCallback(() => {
    onNavigate?.()
  }, [onNavigate])

  /**
   * Rename submit. Receives the trimmed title
   * (the InlineRename component has already
   * validated non-empty).
   */
  const handleRenameSubmit = useCallback(
    (id: string) => async (title: string) => {
      // Clear any prior error for this row.
      setErrors((prev) => ({
        ...prev,
        [id]: { ...prev[id], rename: null },
      }))
      try {
        await rename.mutateAsync({ id, title })
      } catch (err) {
        setErrors((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            rename:
              err instanceof Error
                ? err.message
                : "Couldn't rename the conversation.",
          },
        }))
      }
    },
    [rename],
  )

  /**
   * Delete confirm. After a successful delete
   * we patch the route per the rule in
   * `pickNextRouteAfterDelete` (Task 30).
   */
  const handleDeleteConfirm = useCallback(
    (id: string) => async () => {
      setErrors((prev) => ({
        ...prev,
        [id]: { ...prev[id], delete: null },
      }))
      try {
        await deleteMut.mutateAsync({ id })
        // The cache patch in the mutation already
        // removed the row from the list. Pick
        // the next route from the *current*
        // cache (the data passed in below) and
        // navigate.
        const remaining = query.data?.items.filter((c) => c.id !== id) ?? []
        const next = pickNextRouteAfterDelete(id, activeConversationId, remaining)
        if (next.kind === "navigate") {
          router.push(next.href as never)
        }
      } catch (err) {
        setErrors((prev) => ({
          ...prev,
          [id]: {
            ...prev[id],
            delete:
              err instanceof Error
                ? err.message
                : "Couldn't delete the conversation.",
          },
        }))
      }
    },
    [activeConversationId, deleteMut, query.data, router],
  )

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

  // Memoised row props so the list doesn't
  // re-render every row on every parent
  // render. The callbacks close over the
  // per-id action.
  const itemPropsById = useMemo(() => {
    const map = new Map<
      string,
      {
        isRenaming: boolean
        isDeleting: boolean
        renameError: string | null
        deleteError: string | null
        onRenameSubmit: (title: string) => void
        onDeleteConfirm: () => void
      }
    >()
    const renamingId = rename.isPending
      ? (rename.variables as { id: string } | undefined)?.id
      : undefined
    const deletingId = deleteMut.isPending
      ? (deleteMut.variables as { id: string } | undefined)?.id
      : undefined
    for (const c of query.data?.items ?? []) {
      map.set(c.id, {
        isRenaming: renamingId === c.id,
        isDeleting: deletingId === c.id,
        renameError: errors[c.id]?.rename ?? null,
        deleteError: errors[c.id]?.delete ?? null,
        onRenameSubmit: handleRenameSubmit(c.id),
        onDeleteConfirm: handleDeleteConfirm(c.id),
      })
    }
    return map
  }, [
    query.data,
    rename.isPending,
    rename.variables,
    deleteMut.isPending,
    deleteMut.variables,
    errors,
    handleRenameSubmit,
    handleDeleteConfirm,
  ])

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
          itemPropsById={itemPropsById}
        />
      </div>
    </aside>
  )
}
