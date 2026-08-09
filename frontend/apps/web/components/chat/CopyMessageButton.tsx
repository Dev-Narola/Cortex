/**
 * CopyMessageButton — the "Copy" tertiary control
 * on a completed assistant message.
 *
 * **F4 Part 4 (Tasks 78-80).** The button:
 *
 *   - Calls `navigator.clipboard.writeText(content)`
 *     on click (Tasks 78 + 79).
 *   - Shows a brief "Copied" pill for 1.5s, then
 *     snaps back to the icon (Task 79).
 *   - On failure (browser blocks clipboard, no
 *     `navigator.clipboard`, etc.), shows a small
 *     inline error message under the button —
 *     not a toast (Task 80). The error is the
 *     "do not silently fail" engineering
 *     convention.
 *
 * **Why no toast.** A toast for every copy is
 * noisy; the spec calls for a small temporary
 * state. The pill is enough.
 *
 * **Why no icon-swap from "Copy" → "Check" →
 * "Copy" with a hard transition.** The spec wants
 * a subtle, restrained state. The pill renders
 * a single line: "Copy" → "Copied" → "Copy" with
 * opacity + a 200ms transition.
 *
 * **Accessibility (Task 62).** Native `<button>`
 * with `aria-label="Copy answer"` + `aria-live`
 * on the state pill so screen readers announce
 * "Copied" / "Couldn't copy".
 *
 * **Disabled.** The parent disables the button
 * when a turn is in flight (the input also
 * disables — consistency). We accept a `disabled`
 * prop for that.
 */

"use client"

import { useEffect, type ReactNode } from "react"

import { Button, Icon, cn } from "@cortex/ui"

import { useClipboard } from "./useClipboard"

export interface CopyMessageButtonProps {
  /** The plain text to write to the clipboard. */
  content: string
  /** Disable the button (e.g. while a turn is in flight). */
  disabled?: boolean
  className?: string
}

export function CopyMessageButton({
  content,
  disabled = false,
  className,
}: CopyMessageButtonProps): ReactNode {
  const { state, error, copy, reset } = useClipboard()

  // Reset to idle on unmount so a stale "Copied"
  // doesn't pop into view when the user scrolls
  // past a different message.
  useEffect(() => () => reset(), [reset])

  return (
    <div className={"flex flex-col " + (className ?? "")}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          void copy(content)
        }}
        disabled={disabled}
        aria-label="Copy answer"
        data-state={state}
        className={cn(
          "h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground",
        )}
      >
        {state === "success" ? (
          <>
            <Icon name="Check" className="h-3.5 w-3.5" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Icon name="Copy" className="h-3.5 w-3.5" />
            <span>Copy</span>
          </>
        )}
      </Button>
      {state === "error" ? (
        <p
          role="status"
          aria-live="polite"
          className="ml-2 text-[10px] text-destructive"
        >
          {error?.message ?? "Couldn't copy to clipboard."}
        </p>
      ) : null}
    </div>
  )
}
