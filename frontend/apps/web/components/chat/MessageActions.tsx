/**
 * MessageActions — the tertiary control row under a
 * completed assistant message.
 *
 * **F4 Part 4 (Tasks 77-88).** After Part 3 the
 * assistant bubble looks like:
 *
 *   ┌────────────────────────────────────┐
 *   │ Assistant                          │
 *   │                                    │
 *   │ Answer text...                     │
 *   │                                    │
 *   │ [1] [2] [3]                        │
 *   │                                    │
 *   │   Copy   Regenerate   👍   👎      │   <- this row
 *   └────────────────────────────────────┘
 *
 * **Hierarchy.** The row is intentionally subtle —
 * `text-muted-foreground` with no fill, no shadow.
 * The visual weight sits with the message itself +
 * the citation chips, not with the actions. The
 * UI/UX explicitly calls for tertiary controls that
 * "do not compete with the message input".
 *
 * **Spacing.** Sits BELOW the citation rail in the
 * bubble (per Task 76). The MessageBubble renders
 * this component after the citation rail.
 *
 * **Visibility.** Only assistant messages get an
 * action row. User + tool messages are not actionable
 * (the UI/UX only defines these for the answer).
 *
 * **No global state.** Copy / Regenerate / Feedback
 * are local to the message + the store. The action
 * row does not need a Zustand store; the parent
 * passes the current state in.
 *
 * **Regenerate contract (Tasks 81-84).** The V3
 * backend does not expose `POST /messages/{id}/
 * regenerate`. The closest "regenerate" the user
 * can perform is: send the same last user message
 * again, which would create a new assistant turn
 * in the same conversation. We delegate to the
 * `useRegenerate` hook (which lives in
 * `hooks/chat/useRegenerate.ts`) — it knows the
 * actual V3 contract.
 *
 * **Feedback (Tasks 85-88).** Pure local state for
 * now — the V3 backend doesn't expose a feedback
 * endpoint. The hook is forward-compatible: when V4
 * lands `POST /conversations/{id}/messages/{id}/
 * feedback`, the same hook swaps its body without
 * the UI moving.
 *
 * **Clipboard failure (Task 80).** Caught + surfaced
 * via a transient inline error (small text under the
 * row). The user can retry by clicking Copy again.
 *
 * **Copy state (Task 79).** A short-lived "Copied ✓"
 * pill replaces the Copy icon for 1.5s, then snaps
 * back. No toast — the spec wants the feedback
 * subtle.
 *
 * **Disabled when busy (Task 84).** All buttons
 * disable while the conversation is in `sending` or
 * `streaming` state. The Regenerate button is the
 * critical one — a second submit while a turn is
 * in flight is the duplication guard.
 *
 * **Accessibility (Task 62).** Each button is a
 * native `<button>` with a clear `aria-label`. The
 * feedback pair uses `aria-pressed` to communicate
 * the on/off state. The Copy button uses
 * `aria-live="polite"` on the success/failure pill
 * so screen readers announce the transition.
 */

"use client"

import { type ReactNode } from "react"

import { CopyMessageButton } from "./CopyMessageButton"
import { FeedbackButtons } from "./FeedbackButtons"
import { RegenerateButton } from "./RegenerateButton"

export interface MessageActionsProps {
  /** The conversation id — threaded to
   *  FeedbackButtons (per-message state) and
   *  RegenerateButton (re-send on the same
   *  conversation). */
  conversationId: string
  /** The message id — Regenerate needs it to look
   *  up the preceding user message. */
  messageId: string
  /** The plain-text content the Copy button
   *  writes to the clipboard. We deliberately use
   *  the raw `content` (not the React-rendered
   *  markup) so pasting into Slack / email gives
   *  the user the actual answer. */
  content: string
  /** True while a turn is in flight — all actions
   *  disable. */
  isBusy: boolean
  /** Optional last user message — Regenerate
   *  re-sends this through the conversation
   *  channel. When absent, the Regenerate button
   *  is hidden (the message was the first turn,
   *  or the parent can't determine the preceding
   *  user message). */
  regenerateFor?: {
    conversationId: string
    content: string
  } | null
  className?: string
}

export function MessageActions({
  conversationId,
  messageId,
  content,
  isBusy,
  regenerateFor,
  className,
}: MessageActionsProps): ReactNode {
  return (
    <div
      data-message-actions
      data-message-id={messageId}
      className={
        "mt-2 flex items-center gap-1 text-muted-foreground " +
        (className ?? "")
      }
    >
      <CopyMessageButton content={content} disabled={isBusy} />
      {regenerateFor ? (
        <RegenerateButton
          conversationId={regenerateFor.conversationId}
          content={regenerateFor.content}
          disabled={isBusy}
        />
      ) : null}
      <div className="ml-auto">
        <FeedbackButtons
          conversationId={conversationId}
          messageId={messageId}
          disabled={isBusy}
        />
      </div>
    </div>
  )
}

/**
 * Re-export the shared `useClipboard` hook so the
 * test suite (and any future call site) can import
 * it from a single place.
 */
export { useClipboard } from "./useClipboard"
