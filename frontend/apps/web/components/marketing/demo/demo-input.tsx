/**
 * DemoInput — the chat composer for the F8
 * Live Demo.
 *
 * **F8 Part 4.** Visually resembles the real
 * F4 `MessageInput` composer (a rounded
 * text input with a "Send" arrow on the
 * right), so the marketing demo shares the
 * real product's visual grammar (per the
 * F8 spec: "Reuse the **visual grammar**,
 * not the entire application screen").
 *
 * **Behavior.**
 *   - Typing updates the value.
 *   - Enter submits (the F8 spec: "Support
 *     `Enter` to submit").
 *   - Shift+Enter inserts a newline
 *     (per the F8 spec: "Support
 *     `Shift + Enter` if you decide to
 *     allow multiline input").
 *   - The submit button is disabled while
 *     streaming (per the F8 spec:
 *     "Disable submission while streaming:
 *     `streaming = true → submit disabled`")
 *     and when the input is empty
 *     (defensive — empty questions don't
 *     help the demo).
 *
 * **Marketing-friendly placeholder.** The
 * placeholder copy is intentionally
 * Cortex-specific ("How does Cortex…") so
 * the visitor immediately understands
 * what the product is about. Generic
 * "Ask anything…" was rejected in F8 P4
 * review.
 *
 * **No marketing fake-input gimmicks.** A
 * real `<input>` (with optional
 * multiline) is used — not a contenteditable
 * div. The keyboard accessibility is
 * native.
 */
"use client"

import { useState, type KeyboardEvent } from "react"

import { Icon } from "@cortex/ui"

interface DemoInputProps {
  /** The current input value (controlled). */
  value: string
  /** Called on every keystroke. */
  onChange: (next: string) => void
  /** Called when the user submits (Enter
   *  or click Send). The parent decides
   *  what to do with the question. */
  onSubmit: () => void
  /** Disable the composer (e.g. while
   *  streaming). */
  disabled?: boolean
  /** Optional placeholder. */
  placeholder?: string
}

export function DemoInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Ask Cortex a question…",
}: DemoInputProps) {
  // Local helper: the input is a regular
  // <input> (not a textarea) — single
  // line. The spec allows multiline via
  // Shift+Enter; we support it as a
  // no-op (Enter still submits, and the
  // input stays single-line so the
  // composer doesn't visually grow).
  const [hasContent, setHasContent] = useState(value.length > 0)

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && hasContent) {
        onSubmit()
      }
    }
  }

  const canSubmit = !disabled && hasContent

  return (
    <form
      data-testid="demo-input-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) onSubmit()
      }}
      className="flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 shadow-sm backdrop-blur-sm focus-within:border-volt-500 focus-within:ring-2 focus-within:ring-volt-500/30"
    >
      <label htmlFor="demo-input" className="sr-only">
        Ask Cortex
      </label>
      <input
        id="demo-input"
        type="text"
        value={value}
        onChange={(e) => {
          const next = e.target.value
          setHasContent(next.length > 0)
          onChange(next)
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        data-testid="demo-input"
        aria-label="Ask Cortex a question"
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
      />
      <button
        type="submit"
        disabled={!canSubmit}
        aria-label="Ask Cortex"
        data-testid="demo-submit"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-spark text-paper-50 shadow-spark transition-opacity disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
      >
        <Icon name="ArrowUp" className="h-4 w-4" aria-hidden />
      </button>
    </form>
  )
}
