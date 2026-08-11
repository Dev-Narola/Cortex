/**
 * ConversationListItem — one row in the
 * conversation history list.
 *
 * **F5 Part 1 (Task 9) + Part 2 (rename +
 * delete).** A single clickable row that
 * links to the conversation. Renders the
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
 * **Action mode (Part 2).** The row has three
 * sub-states, mutually exclusive:
 *
 *   Normal
 *     ↓ click ⋯ → Rename
 *     ↓ click ⋯ → Delete
 *   Renaming
 *     ↓ Enter / Save → mutation
 *     ↓ Escape → Normal
 *   Deleting
 *     ↓ Cancel → Normal
 *     ↓ Delete (confirm) → mutation → Normal
 *                          (parent removes the row)
 *
 * The row stays a native `<a href="/chat/{id}">`
 * — when not in an action sub-state, click +
 * middle-click + cmd-click all work. The
 * action menu's `e.stopPropagation()` keeps
 * the click from navigating.
 *
 * **Accessibility (Task 31).**
 *   - Native `<a href="/chat/{id}">` so middle-click,
 *     cmd-click, and "open in new tab" all work.
 *   - `aria-current="page"` when active so AT
 *     announces the selection.
 *   - The timestamp is the secondary line; it's
 *     in `muted-foreground` and machine-readable
 *     via the ISO string.
 *
 * **No fetch / no store.** Pure UI. The parent
 * provides the data + the mutations.
 */

import {
  useCallback,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"

import { Icon, cn } from "@cortex/ui"

import type { Conversation } from "@/types/conversation"

import { ConversationActionMenu } from "./ConversationActionMenu"
import { DeleteConfirmation } from "./DeleteConfirmation"
import { InlineRename } from "./InlineRename"

export interface ConversationListItemProps {
  conversation: Conversation
  /** The conversation id currently open in the main pane. */
  activeConversationId: string | null
  /**
   * True while the parent's rename mutation
   * is in flight. Disables the input + the
   * Save button so the user can't double-submit.
   */
  isRenaming?: boolean
  /**
   * True while the parent's delete mutation
   * is in flight. Disables the Cancel + Delete
   * buttons in the confirmation panel.
   */
  isDeleting?: boolean
  /**
   * Inline error to render under the rename
   * input (server-side rename failure). Cleared
   * the next time the user types in the input.
   */
  renameError?: string | null
  /**
   * Inline error to render in the delete
   * confirmation panel. Cleared on the next
   * confirm attempt.
   */
  deleteError?: string | null
  /** User pressed Enter / Save in the rename input. */
  onRenameSubmit?: (title: string) => void
  /** User pressed Escape / X / Save in the rename input. */
  onRenameCancel?: () => void
  /** User clicked Delete in the action menu. */
  onDeleteRequest?: () => void
  /** User clicked Delete in the confirmation panel. */
  onDeleteConfirm?: () => void
  /** User clicked Cancel in the confirmation panel (or pressed Escape). */
  onDeleteCancel?: () => void
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

export type ConversationItemMode = "normal" | "renaming" | "deleting"

export function ConversationListItem({
  conversation,
  activeConversationId,
  isRenaming = false,
  isDeleting = false,
  renameError,
  deleteError,
  onRenameSubmit,
  onRenameCancel,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  className,
}: ConversationListItemProps): ReactNode {
  const [mode, setMode] = useState<ConversationItemMode>("normal")
  const isActive = conversation.id === activeConversationId
  const href = `/chat/${encodeURIComponent(conversation.id)}` as never

  const startRename = useCallback(() => {
    setMode("renaming")
  }, [])
  const startDelete = useCallback(() => {
    setMode("deleting")
  }, [])
  const backToNormal = useCallback(() => {
    setMode("normal")
  }, [])

  // Per-render wrappers so the callback shape
  // stays stable for `useEffect` consumers.
  const handleRenameSubmit = useCallback(
    (title: string) => {
      onRenameSubmit?.(title)
      // The parent invalidates the list on
      // success; we exit edit mode when the
      // mutation finishes. The cleanest UX is to
      // exit immediately on submit (most apps
      // do this) and rely on the optimistic /
      // server-confirmed cache patch to land
      // the new title in the row.
      backToNormal()
    },
    [backToNormal, onRenameSubmit],
  )
  const handleRenameCancel = useCallback(() => {
    onRenameCancel?.()
    backToNormal()
  }, [backToNormal, onRenameCancel])
  const handleDeleteRequest = useCallback(() => {
    onDeleteRequest?.()
    startDelete()
  }, [onDeleteRequest, startDelete])
  const handleDeleteConfirm = useCallback(() => {
    onDeleteConfirm?.()
    // The parent owns the success path: it
    // removes the row from the list (cache
    // patch in the hook layer).
  }, [onDeleteConfirm])
  const handleDeleteCancel = useCallback(() => {
    onDeleteCancel?.()
    backToNormal()
  }, [backToNormal, onDeleteCancel])

  // Click suppression for action sub-states. The
  // row is normally a navigation anchor; when
  // it's in renaming / deleting mode, we render
  // a `<div>` (no anchor) but a stray click on
  // the wrapper itself could still bubble up to
  // a parent handler (the outer list, the row
  // hover, etc.). We stop propagation only when
  // the click TARGET is the wrapper itself —
  // descendant button clicks (Cancel, Save,
  // etc.) should still reach their own handlers.
  const stopNav = useCallback((e: MouseEvent) => {
    if (mode !== "normal" && e.target === e.currentTarget) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [mode])

  if (mode === "renaming") {
    return (
      <li className="min-w-0" data-mode="renaming">
        <div
          className={cn(
            "group relative flex flex-col gap-1 rounded-md px-2.5 py-2",
            isActive && "bg-ember-500/10",
            className,
          )}
          onClickCapture={stopNav}
        >
          <InlineRename
            initialTitle={conversation.title}
            isSaving={isRenaming}
            onSubmit={handleRenameSubmit}
            onCancel={handleRenameCancel}
          />
          {renameError ? (
            <p
              role="alert"
              className="ml-5 text-[10px] text-destructive"
            >
              {renameError}
            </p>
          ) : null}
        </div>
      </li>
    )
  }

  if (mode === "deleting") {
    return (
      <li className="min-w-0" data-mode="deleting">
        <div
          className={cn(
            "group relative flex flex-col gap-1 rounded-md px-2.5 py-2",
            isActive && "bg-ember-500/10",
            className,
          )}
          onClickCapture={stopNav}
        >
          <DeleteConfirmation
            conversationTitle={conversation.title}
            isDeleting={isDeleting}
            errorMessage={deleteError}
            onCancel={handleDeleteCancel}
            onConfirm={handleDeleteConfirm}
          />
        </div>
      </li>
    )
  }

  return (
    <li className="min-w-0" data-mode="normal">
      <a
        href={href}
        aria-current={isActive ? "page" : undefined}
        data-active={isActive ? "true" : "false"}
        data-conversation-id={conversation.id}
        title={conversation.title}
        className={cn(
          "group relative flex w-full items-start gap-1 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
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
        <Icon
          name="MessageSquare"
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0",
            isActive ? "text-ember-600" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            data-conversation-title
            className="min-w-0 truncate font-medium"
          >
            {conversation.title}
          </span>
          <span className="truncate text-[10px] text-muted-foreground tabular-nums">
            {formatRelative(conversation.updatedAt)}
          </span>
        </div>
        <ConversationActionMenu
          onRename={startRename}
          onDelete={handleDeleteRequest}
        />
      </a>
    </li>
  )
}
