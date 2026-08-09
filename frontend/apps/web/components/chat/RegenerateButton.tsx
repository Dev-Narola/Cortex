/**
 * RegenerateButton — the "Regenerate" tertiary
 * control on a completed assistant message.
 *
 * **F4 Part 4 (Tasks 81-84).** The button:
 *
 *   - Re-sends the most recent user message
 *     through the conversation channel. The
 *     V3 backend treats that as a new turn on
 *     the same conversation — there is no
 *     dedicated `/regenerate` endpoint.
 *   - Disables itself when a turn is in flight
 *     (the input also disables — same visual
 *     signal).
 *   - Shows a subtle "Regenerating…" state
 *     when the local mutation is pending
 *     (Task 83).
 *
 * **Why a button label change (Task 83).** The
 * spec is explicit:
 *
 *   > The UI should clearly indicate that a
 *   > new response is being generated. Do not
 *   > leave the old answer looking completely
 *   > finished while a second answer is
 *   > appearing elsewhere.
 *
 * We solve this two ways:
 *
 *   1. The local button swaps its label to
 *      "Regenerating…" while the mutation
 *      is pending. The user knows the new
 *      turn has been requested.
 *   2. The existing `StreamingMessage`
 *      component (F4 P2) is rendered for the
 *      new turn — its Spark Glow + cursor
 *      are the unmistakable signal that
 *      something is in flight.
 *
 * **Why no toast on "duplication guard" hit.**
 * A toast for "you can't regenerate right
 * now" is noise. The button is disabled, the
 * input is disabled, the message is being
 * streamed — those are enough signals.
 *
 * **Accessibility (Task 62).** Native
 * `<button>` with `aria-label="Regenerate
 * answer"`. The state pill is announced via
 * `aria-live="polite"`.
 */

"use client"

import { type ReactNode } from "react"

import { Button, Icon, Spinner } from "@cortex/ui"

import { useRegenerate } from "@/hooks/chat/useRegenerate"

export interface RegenerateButtonProps {
  conversationId: string
  /**
   * The text of the preceding user message —
   * the message we re-send through the
   * conversation channel.
   */
  content: string
  disabled?: boolean
  className?: string
}

export function RegenerateButton({
  conversationId,
  content,
  disabled = false,
  className,
}: RegenerateButtonProps): ReactNode {
  const { regenerate, isBusy } = useRegenerate({ conversationId })

  const busy = disabled || isBusy

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => regenerate(content)}
      disabled={busy}
      aria-label="Regenerate answer"
      aria-busy={isBusy}
      data-state={isBusy ? "regenerating" : "idle"}
      className={
        "h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground " +
        (className ?? "")
      }
    >
      {isBusy ? (
        <>
          <Spinner size="sm" aria-hidden className="h-3.5 w-3.5" />
          <span>Regenerating…</span>
        </>
      ) : (
        <>
          <Icon name="RefreshCw" className="h-3.5 w-3.5" />
          <span>Regenerate</span>
        </>
      )}
    </Button>
  )
}
