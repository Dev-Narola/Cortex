/**
 * MessageInput — the pinned-to-bottom input.
 *
 * **F4 Part 1 (Task 12 + 13).** Slate input bar with
 * Volt focus ring. Multi-line textarea, Enter sends,
 * Shift+Enter inserts a newline. Disabled-empty state.
 *
 * **No POST /conversations/{id}/messages yet** — Part 2.
 * The input is a controlled component that emits its
 * current value to the parent; the parent decides
 * what to do with it (Part 2 will POST the message
 * and trigger the WebSocket stream).
 *
 * **Why a controlled component, not uncontrolled.**
 * Part 2 needs the value to be readable at submit
 * time without reaching into the DOM. Controlled
 * also makes it trivial to clear after a successful
 * send.
 *
 * **Disabled state.** Disabled when the value is
 * empty after trim. The Send button is also disabled
 * when `disabled` is passed in (Part 2 will pass
 * `disabled` while a generation is in flight).
 *
 * **Send affordance.** Enter sends, Shift+Enter
 * newlines. We avoid the auto-growing textarea
 * pattern for Part 1 — the input is a single row
 * of `min-h-10` and grows via `field-sizing-content`
 * (modern browsers only; the fallback is the
 * single-line height). Part 2 may revisit this.
 */

"use client"

import {
  useCallback,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"

import { Button, Icon, Textarea } from "@cortex/ui"

export interface MessageInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  /** Disable both the input + the Send button
   *  (Part 2 uses this while a generation is in
   *  flight). */
  disabled?: boolean
  /** Override the placeholder copy. */
  placeholder?: string
  /** Optional className passthrough. */
  className?: string
}

export function MessageInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = "Ask something about your knowledge base…",
  className,
}: MessageInputProps): ReactNode {
  const isEmpty = value.trim().length === 0
  const sendDisabled = disabled || isEmpty

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.currentTarget.value)
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter") return
      // Shift+Enter is a literal newline. The
      // textarea handles it natively; we just
      // suppress the form submit.
      if (e.shiftKey) return
      // Plain Enter on a disabled input is a no-op.
      if (sendDisabled) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      onSubmit(value.trim())
    },
    [onSubmit, sendDisabled, value],
  )

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (sendDisabled) return
      onSubmit(value.trim())
    },
    [onSubmit, sendDisabled, value],
  )

  return (
    <form
      onSubmit={handleSubmit}
      className={
        "border-t border-border bg-card/50 px-4 py-3 sm:px-6 " +
        (className ?? "")
      }
      aria-label="Send a message"
    >
      <div
        className={
          "flex items-end gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 " +
          "transition-colors focus-within:border-volt-500 focus-within:ring-2 focus-within:ring-volt-500/30"
        }
      >
        <Textarea
          aria-label="Message"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <Button
          type="submit"
          size="icon"
          variant="spark"
          disabled={sendDisabled}
          aria-label="Send message"
          title={sendDisabled ? "Type a message to send" : "Send"}
        >
          <Icon name="Send" className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
        Enter to send · Shift+Enter for newline
      </p>
    </form>
  )
}
