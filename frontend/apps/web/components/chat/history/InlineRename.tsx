/**
 * InlineRename — the input row that replaces
 * `ConversationListItem`'s title when the user
 * clicks Rename.
 *
 * **F5 Part 2 (Task 10-14).** Renders the
 * existing `Input` primitive (no new component),
 * focuses + selects the text on mount, commits
 * on Enter, cancels on Escape.
 *
 * **State model.**
 *
 *   Normal → (user clicks Rename)
 *     → Editing  (this component, controlled
 *                 by `useRenameConversation` from
 *                 the parent)
 *     → Saving  (mutation.isPending)
 *     → Normal  (success — list cache patched)
 *     → Editing  (failure — text restored from
 *                 the original `value` prop; the
 *                 user can try again)
 *
 * **Validation.** Empty / whitespace-only is
 * rejected client-side (Task 15-16). The submit
 * handler trims before sending, so a trailing
 * space never becomes a title.
 *
 * **Accessibility.**
 *   - aria-label identifies the field.
 *   - aria-invalid flips when the local validation
 *     error is set.
 *   - role="alert" on the error so screen readers
 *     announce it immediately.
 *   - The Escape key handler uses the native
 *     `keydown` listener; the Enter key submits
 *     the form (which the parent can also
 *     trigger via an "onSubmit" handler if it
 *     wants the form semantics).
 *
 * **No fetch / no store.** The component is
 * presentational + local-state. The mutation
 * lives in the parent.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"

import { Button, Icon, Input } from "@cortex/ui"

export interface InlineRenameProps {
  /** The current title. Used as the initial value + the cancellation fallback. */
  initialTitle: string
  /** True while the parent mutation is in flight. */
  isSaving: boolean
  /** Submit handler. Receives the trimmed title. */
  onSubmit: (trimmedTitle: string) => void
  /** Cancel handler (Escape / X button / successful save). */
  onCancel: () => void
  className?: string
}

export function InlineRename({
  initialTitle,
  isSaving,
  onSubmit,
  onCancel,
  className,
}: InlineRenameProps): ReactNode {
  const [value, setValue] = useState(initialTitle)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus + select on mount. Per Task 12 the user
  // should be able to type or paste without a
  // second click. `select()` highlights the text
  // so a fresh "rename" starts with the existing
  // title selected — type-to-replace.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  // If the underlying conversation title changes
  // (e.g. a different list item started editing),
  // reset the local state to match.
  useEffect(() => {
    setValue(initialTitle)
  }, [initialTitle])

  const validate = useCallback(
    (raw: string): { ok: true; value: string } | { ok: false; message: string } => {
      const trimmed = raw.trim()
      if (trimmed.length === 0) {
        return { ok: false, message: "Conversation name can't be empty." }
      }
      return { ok: true, value: trimmed }
    },
    [],
  )

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault()
      if (isSaving) return
      const result = validate(value)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setError(null)
      onSubmit(result.value)
    },
    [isSaving, onSubmit, validate, value],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        // Escape never fires a request. The
        // parent's `onCancel` clears the local
        // editing state and restores the original
        // title from the `initialTitle` prop.
        onCancel()
      }
    },
    [onCancel],
  )

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Rename conversation"
      data-inline-rename
      className={"flex w-full flex-col gap-1 " + (className ?? "")}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          name="MessageSquare"
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.currentTarget.value)
            if (error) setError(null)
          }}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          aria-label="Conversation title"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "rename-error" : undefined}
          maxLength={512}
          className="h-7 flex-1 px-2 text-sm"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          disabled={isSaving}
          aria-label="Save rename"
          className="h-7 w-7 shrink-0"
          onClick={(e) => {
            // The form's onSubmit fires; we just
            // stop the click from bubbling to the
            // parent anchor (the list item is a
            // <a> for navigation).
            e.stopPropagation()
          }}
        >
          <Icon name="Check" className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={isSaving}
          aria-label="Cancel rename"
          onClick={(e) => {
            e.stopPropagation()
            onCancel()
          }}
          className="h-7 w-7 shrink-0"
        >
          <Icon name="X" className="h-3.5 w-3.5" />
        </Button>
      </div>
      {error ? (
        <p
          id="rename-error"
          role="alert"
          className="ml-5 text-[10px] text-destructive"
        >
          {error}
        </p>
      ) : null}
      {isSaving ? (
        <p
          role="status"
          aria-live="polite"
          className="ml-5 text-[10px] text-muted-foreground"
        >
          Saving…
        </p>
      ) : null}
    </form>
  )
}
