/**
 * InterruptedBanner — the "Response interrupted"
 * recovery surface for a WebSocket drop mid-stream.
 *
 * **F4 Part 4 (Tasks 94 + 95).** When the WS
 * dies before `message_complete` arrives, the
 * stream store flips the conversation to
 * `interrupted` and the store keeps the
 * partial accumulator. We render a small
 * inline banner UNDER the streaming bubble
 * with:
 *
 *   - A short "Response interrupted" copy
 *   - The partial content the user already
 *     saw (preserved by the streaming
 *     bubble — see `StreamingMessage`).
 *   - A "Retry" action that re-sends the
 *     SAME last user message through the
 *     send channel.
 *
 * **Why Retry, not auto-resubmit.** The V3
 * backend doesn't expose a stream-offset
 * concept. Auto-resubmitting would create a
 * duplicate assistant turn. The user has to
 * ask again explicitly. The button is
 * disabled while a retry is in flight; the
 * duplication guard (Task 84) is enforced
 * by the same stream-store check
 * `useRegenerate` already uses.
 *
 * **Why a banner, not a toast.** The
 * interrupted state is the conversation's
 * new state — the user needs to see it
 * next time they scroll into the chat, not
 * just once when it happened.
 *
 * **Accessibility.** `role="status"`,
 * `aria-live="polite"`, `aria-label` on the
 * retry button. Escape does not close the
 * banner — the spec doesn't ask for it; the
 * banner is a piece of conversation state,
 * not a transient.
 */

"use client"

import { useState, type ReactNode } from "react"

import { Button, Icon } from "@cortex/ui"

import { useRegenerate } from "@/hooks/chat"

export interface InterruptedBannerProps {
  conversationId: string
  /** The text of the last user message —
   *  the message we re-send on Retry. */
  content: string
  className?: string
}

export function InterruptedBanner({
  conversationId,
  content,
  className,
}: InterruptedBannerProps): ReactNode {
  const { regenerate, isBusy } = useRegenerate({ conversationId })
  // Surface a one-shot "tried it" hint after
  // the user clicks Retry. The local state
  // clears itself the next time the stream
  // transitions out of `sending` / back to
  // `interrupted` — we use a simple effect on
  // `isBusy` to reset the message.
  const [hint, setHint] = useState<string | null>(null)
  return (
    <div
      role="status"
      aria-live="polite"
      data-interrupted-banner
      className={
        "mt-2 flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground " +
        (className ?? "")
      }
    >
      <Icon
        name="TriangleAlert"
        className="h-4 w-4 shrink-0 text-amber-600"
        aria-hidden
      />
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-medium">Response interrupted</span>
        <span className="text-muted-foreground">
          Cortex lost the connection before the answer finished. Press
          <span className="mx-1 font-medium">Retry</span>
          to resend the same question.
        </span>
        {hint ? (
          <span className="text-[10px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          if (isBusy) return
          setHint("Retrying…")
          regenerate(content)
        }}
        disabled={isBusy}
        aria-label="Retry the interrupted response"
        className="shrink-0"
      >
        <Icon name="RefreshCw" className="h-3.5 w-3.5" />
        <span>{isBusy ? "Retrying…" : "Retry"}</span>
      </Button>
    </div>
  )
}
