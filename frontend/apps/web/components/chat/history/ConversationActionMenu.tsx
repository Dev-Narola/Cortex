/**
 * ConversationActionMenu — the `⋯` trigger +
 * the Rename / Delete actions.
 *
 * **F5 Part 2 (Task 9, 20, 24).** Renders a
 * compact trigger button (the existing icon
 * set: `MoreHorizontal`). Clicking the trigger
 * opens a small floating menu with two items:
 * Rename + Delete.
 *
 * **Permission gate (Task 27).** The Delete
 * action is hidden for `viewer` role users
 * (per the UI/UX cross-cutting rule). Rename
 * is shown to all roles — the backend enforces
 * the real authorisation boundary.
 *
 * **Outside click (Task 19).** The menu closes
 * when the user clicks anywhere outside the
 * floating panel, OR presses Escape, OR picks
 * an action. A native `<dialog>` element via
 * Radix would handle the focus trap + outside
 * click for us, but the F1 package doesn't
 * ship a Popover primitive. The hand-rolled
 * approach (a positioned <div> + a single
 * document-level click listener) is sufficient
 * for a 2-item action menu.
 *
 * **State machine (one item at a time).**
 *
 *   Closed
 *     ↓ click trigger
 *   MenuOpen  (rename / delete visible)
 *     ↓ click Rename  → setMode("rename")  on parent
 *     ↓ click Delete  → setMode("delete")  on parent
 *     ↓ click outside → MenuOpen → Closed
 *     ↓ Escape       → MenuOpen → Closed
 *
 * The component does NOT own the rename / delete
 * state — the parent (`ConversationListItem`)
 * does. The menu only emits the two intent
 * callbacks.
 */

"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { Button, Icon } from "@cortex/ui"

import { useCurrentUserRole } from "@/hooks/auth/useCurrentUserRole"

export interface ConversationActionMenuProps {
  onRename: () => void
  onDelete: () => void
  className?: string
}

export function ConversationActionMenu({
  onRename,
  onDelete,
  className,
}: ConversationActionMenuProps): ReactNode {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const role = useCurrentUserRole()
  const canDelete = role !== null && role !== "viewer"

  const close = useCallback(() => setOpen(false), [])

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const root = rootRef.current
      if (!root) return
      if (e.target instanceof Node && root.contains(e.target)) return
      close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, close])

  return (
    <div
      ref={rootRef}
      data-conversation-action-menu
      className={"relative " + (className ?? "")}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open conversation actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((prev) => !prev)
        }}
        // The list item is a <a>; stop propagation
        // so opening the menu doesn't navigate.
        className="h-6 w-6 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[open=true]:opacity-100"
        data-open={open ? "true" : "false"}
      >
        <Icon name="EllipsisVertical" className="h-3.5 w-3.5" />
      </Button>
      {open ? (
        <div
          role="menu"
          aria-label="Conversation actions"
          data-conversation-menu
          // The menu floats to the right edge of
          // the trigger; on narrow widths it stays
          // inside the sidebar. z-30 keeps it
          // above adjacent rows on hover.
          className="absolute right-0 top-7 z-30 min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              close()
              onRename()
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500/40"
          >
            <Icon name="Pencil" className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Rename</span>
          </button>
          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                close()
                onDelete()
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500/40"
            >
              <Icon name="Trash" className="h-3.5 w-3.5" />
              <span>Delete</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
