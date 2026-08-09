/**
 * FeedbackButtons — the 👍 / 👎 pair on a
 * completed assistant message.
 *
 * **F4 Part 4 (Tasks 85-88).** Two icon-only
 * buttons; the selected one stays highlighted.
 *
 * **Local state only (Task 87).** The V3
 * backend does not expose `POST /messages/{id}/
 * feedback`. The component is therefore a
 * pure UI affordance for now — no fake
 * persistence, no mocked endpoint. When V4
 * lands a feedback endpoint, the
 * `useFeedback` hook (this file) swaps its
 * body without the UI moving.
 *
 * **Mutual exclusion (Task 86).** Selecting
 * 👍 deselects 👎 and vice versa. Implemented
 * via a single `feedback: "up" | "down" | null`
 * state, not two booleans.
 *
 * **Optimistic + immediate (Task 88).** The
 * click flips the visual state synchronously;
 * the network round-trip (when it exists) is
 * fire-and-forget on top. The user shouldn't
 * wait for the server to see their click.
 *
 * **Disabled when busy (Task 84).** Same
 * pattern as Copy / Regenerate. A turn in
 * flight means the user is mid-stream; we
 * disable the buttons so the feedback isn't
 * attached to a soon-to-be-superseded answer.
 *
 * **Accessibility (Task 62).** Both buttons
 * are native `<button>` with `aria-pressed`
 * + `aria-label`. The selected one is also
 * visually distinct (Ember fill).
 *
 * **The icons.** We deliberately use
 * `ThumbsUp` / `ThumbsDown` (lucide names) —
 * added to the `ICON_ACTIONS` category list
 * in this part. No emoji in production code.
 */

"use client"

import {
  useCallback,
  type ReactNode,
} from "react"

import { Icon, cn } from "@cortex/ui"

import { useFeedback } from "@/hooks/chat/useFeedback"

export type FeedbackValue = "up" | "down" | null

export interface FeedbackButtonsProps {
  /** The conversation the message belongs to
   *  (the feedback store is keyed by
   *  conversation + message). */
  conversationId: string
  /** The assistant message id. */
  messageId: string
  /** Disable both buttons (e.g. while a turn is in flight). */
  disabled?: boolean
  className?: string
}

export function FeedbackButtons({
  conversationId,
  messageId,
  disabled = false,
  className,
}: FeedbackButtonsProps): ReactNode {
  const { feedback, setFeedback } = useFeedback({ conversationId, messageId })
  return (
    <div
      role="group"
      aria-label="Rate this answer"
      data-feedback={feedback ?? "none"}
      className={"flex items-center gap-0.5 " + (className ?? "")}
    >
      <FeedbackButton
        value="up"
        label="Thumbs up"
        isActive={feedback === "up"}
        disabled={disabled}
        onClick={setFeedback}
      />
      <FeedbackButton
        value="down"
        label="Thumbs down"
        isActive={feedback === "down"}
        disabled={disabled}
        onClick={setFeedback}
      />
    </div>
  )
}

interface FeedbackButtonProps {
  value: "up" | "down"
  label: string
  isActive: boolean
  disabled: boolean
  onClick: (next: "up" | "down" | null) => void
}

function FeedbackButton({
  value,
  label,
  isActive,
  disabled,
  onClick,
}: FeedbackButtonProps): ReactNode {
  const handle = useCallback(() => {
    // Toggle off if the same value is clicked
    // again; otherwise switch to the new value.
    // The button is the only source of truth —
    // the parent is a single-string state.
    onClick(isActive ? null : value)
  }, [isActive, onClick, value])
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isActive}
      onClick={handle}
      disabled={disabled}
      data-feedback-value={value}
      data-active={isActive ? "true" : "false"}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md",
        "text-muted-foreground transition-colors duration-200",
        "hover:bg-ember-500/10 hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt-500/60",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
        isActive && "bg-ember-500/15 text-ember-600 hover:text-ember-700",
      )}
    >
      <Icon
        name={value === "up" ? "ThumbsUp" : "ThumbsDown"}
        className="h-3.5 w-3.5"
      />
    </button>
  )
}
