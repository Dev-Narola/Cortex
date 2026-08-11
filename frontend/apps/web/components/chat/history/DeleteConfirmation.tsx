/**
 * DeleteConfirmation — the compact inline
 * confirm-or-cancel panel for a conversation
 * delete.
 *
 * **F5 Part 2 (Task 25).** The UI/UX is
 * explicit: "compact confirmation, not a full
 * modal — this is a low-stakes, easily-undoable
 * action". So this is NOT a Dialog. It's a
 * small horizontal panel that appears in the
 * same row as the conversation title, with
 * two buttons: Cancel + Delete.
 *
 * **State machine.**
 *
 *   Idle  (not mounted — the conversation item
 *          shows the normal title row)
 *   Confirming  (this component, asking the
 *               user to confirm)
 *     ↓ Cancel  → Confirming → Idle
 *     ↓ Delete  → Confirming → Deleting
 *
 *   Deleting  (parent shows a spinner on the
 *              button while the mutation runs)
 *     ↓ success  → row removed from the list
 *                   (the parent's job)
 *     ↓ failure  → Confirming + inline error
 *
 * **Visual tokens.** "Delete" uses the existing
 * destructive token (red text + red border on
 * hover); the panel background is the same
 * popover surface used by the action menu so
 * the two states feel like the same family.
 *
 * **Accessibility.**
 *   - `role="alertdialog"` so AT announces the
 *     prompt.
 *   - `aria-labelledby` + `aria-describedby` so
 *     the title + body are read together.
 *   - Escape cancels.
 *   - Tab cycles between Cancel + Delete.
 *
 * **No fetch / no store.** The component is
 * presentational + local-state. The mutation
 * lives in the parent (which calls
 * `useDeleteConversation`).
 */

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react"

import { Button, Icon, Spinner } from "@cortex/ui"

export interface DeleteConfirmationProps {
  /** Conversation title (used in the prompt copy). */
  conversationTitle: string
  /** True while the parent mutation is in flight. */
  isDeleting: boolean
  /** Inline error from the last failed delete attempt, or null. */
  errorMessage?: string | null
  /** Cancel handler. */
  onCancel: () => void
  /** Confirm handler. */
  onConfirm: () => void
  className?: string
}

export function DeleteConfirmation({
  conversationTitle,
  isDeleting,
  errorMessage,
  onCancel,
  onConfirm,
  className,
}: DeleteConfirmationProps): ReactNode {
  const cancelRef = useRef<HTMLButtonElement>(null)
  // Auto-focus the safe action so an accidental
  // Enter doesn't delete. (Tab moves to Delete;
  // Enter on Delete confirms.)
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && !isDeleting) {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }
    },
    [isDeleting, onCancel],
  )

  const titleId = "delete-confirm-title"
  const descId = "delete-confirm-desc"

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      aria-busy={isDeleting || undefined}
      data-delete-confirmation
      onKeyDown={handleKeyDown}
      className={
        "flex w-full flex-col gap-2 rounded-md border border-destructive/30 bg-popover px-3 py-2 shadow-sm " +
        (className ?? "")
      }
    >
      <div className="flex flex-col gap-0.5">
        <span
          id={titleId}
          className="text-sm font-medium text-foreground"
        >
          Delete conversation?
        </span>
        <span
          id={descId}
          className="text-xs text-muted-foreground"
        >
          <span className="font-medium text-foreground/80">
            {conversationTitle}
          </span>{" "}
          and its messages will be removed. This can't be undone.
        </span>
      </div>
      {errorMessage ? (
        <p
          role="alert"
          className="text-xs text-destructive"
          data-delete-error
        >
          {errorMessage}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          ref={cancelRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isDeleting}
          className="h-7"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onConfirm}
          disabled={isDeleting}
          data-delete-confirm
          className="h-7"
        >
          {isDeleting ? (
            <>
              <Spinner size="sm" aria-hidden className="h-3.5 w-3.5" />
              <span>Deleting…</span>
            </>
          ) : (
            <>
              <Icon name="Trash" className="h-3.5 w-3.5" />
              <span>Delete</span>
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
