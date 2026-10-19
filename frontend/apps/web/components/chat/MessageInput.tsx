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
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
} from "react"

import { Button, Icon, Textarea } from "@cortex/ui"

import { BoltMark } from "./BoltMark"

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
      className={`mx-auto w-full max-w-[calc(48rem+3rem)] px-3 pt-2 pb-3 sm:px-6 sm:pb-4 ${className ?? ""}`}
      aria-label="Send a message"
    >
      <div
        className={
          "flex items-end gap-2 rounded-[1.375rem] border border-border bg-card py-1.5 pr-1.5 pl-3 shadow-sm " +
          "transition-[border-color,box-shadow] duration-base focus-within:border-brand-border focus-within:shadow-[0_0_0_4px_var(--brand-soft)]"
        }
      >
        <BoltMark className="mb-2.5 h-5 w-5" />
        <Textarea
          aria-label="Message"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          minRows={1}
          maxRows={8}
          autoResize
          className="min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm shadow-none focus-within:ring-0 focus-within:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <Button
          type="submit"
          size="icon"
          variant="default"
          disabled={sendDisabled}
          aria-label="Send message"
          title={sendDisabled ? "Type a message to send" : "Send"}
        >
          <Icon name="Send" className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-1.5 px-3 text-[11px] text-faint">
        <kbd className="font-sans font-medium text-muted-foreground">Enter</kbd> to send ·{" "}
        <kbd className="font-sans font-medium text-muted-foreground">Shift+Enter</kbd> for a new
        line
      </p>
    </form>
  )
}
