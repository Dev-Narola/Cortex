/**
 * useFeedback — the local "did the user like
 * this answer" hook.
 *
 * **F4 Part 4 (Task 87).** The V3 backend does
 * not expose a feedback endpoint. This hook is
 * therefore a pure local-state holder for now:
 *
 *   - `feedback: "up" | "down" | null`
 *   - `setFeedback(next)` — toggle / switch /
 *     clear.
 *
 * **Why the abstraction is here anyway.** When
 * V4 lands `POST /conversations/{id}/messages/
 * {id}/feedback`, the swap is mechanical:
 * `setFeedback` becomes a `useMutation` whose
 * `onMutate` updates local state + whose
 * `onError` rolls back. The UI calls the same
 * function and the same `feedback` selector.
 *
 * **Per-conversation key (Task 86 + 88).** The
 * state is keyed by `conversationId + messageId`
 * so navigating between conversations doesn't
 * leak the 👍 from one into another. We store
 * the map in a small Zustand store (feedback
 * is local UI state, not server data — the
 * spec routes local UI state through Zustand).
 *
 * **No persistence.** The spec doesn't ask for
 * cross-session persistence, and the server
 * doesn't back the state. Refresh = clear.
 */

"use client"

import { useCallback } from "react"

import { create } from "zustand"

export type FeedbackValue = "up" | "down" | null

export interface FeedbackEntry {
  conversationId: string
  messageId: string
  feedback: FeedbackValue
}

interface FeedbackState {
  /**
   * Last-applied feedback per
   * `${conversationId}:${messageId}`. Insertion
   * order is preserved (we re-iterate on
   * `clear()`).
   */
  entries: FeedbackEntry[]
  /**
   * Apply a feedback value to a (conversation,
   * message) pair. Re-applying the same value
   * clears it; a different value switches.
   */
  apply: (input: {
    conversationId: string
    messageId: string
    value: FeedbackValue
  }) => void
  /** Read the value for a given pair. */
  get: (input: { conversationId: string; messageId: string }) => FeedbackValue
  /** Test-only. */
  reset: () => void
}

const useFeedbackStore = create<FeedbackState>((set, get) => ({
  entries: [],
  apply: ({ conversationId, messageId, value }) => {
    const entries = get().entries
    const idx = entries.findIndex(
      (e) => e.conversationId === conversationId && e.messageId === messageId,
    )
    if (idx === -1) {
      if (value === null) return
      set({ entries: [...entries, { conversationId, messageId, feedback: value }] })
      return
    }
    if (value === null) {
      const next = entries.slice()
      next.splice(idx, 1)
      set({ entries: next })
      return
    }
    const next = entries.slice()
    next[idx] = { conversationId, messageId, feedback: value }
    set({ entries: next })
  },
  get: ({ conversationId, messageId }) => {
    const found = get().entries.find(
      (e) => e.conversationId === conversationId && e.messageId === messageId,
    )
    return found?.feedback ?? null
  },
  reset: () => set({ entries: [] }),
}))

export interface UseFeedbackResult {
  feedback: FeedbackValue
  setFeedback: (next: FeedbackValue) => void
}

export function useFeedback(input: {
  conversationId: string
  messageId: string
}): UseFeedbackResult {
  const feedback = useFeedbackStore((s) => {
    const found = s.entries.find(
      (e) =>
        e.conversationId === input.conversationId &&
        e.messageId === input.messageId,
    )
    return found?.feedback ?? null
  })
  const setFeedback = useCallback(
    (next: FeedbackValue) => {
      useFeedbackStore.getState().apply({
        conversationId: input.conversationId,
        messageId: input.messageId,
        value: next,
      })
    },
    [input.conversationId, input.messageId],
  )
  return { feedback, setFeedback }
}

/**
 * The store handle. Exported for tests that need
 * to reset between cases. Production code should
 * use the `useFeedback` hook.
 */
export const feedbackStore = {
  reset: () => useFeedbackStore.getState().reset(),
  get: useFeedbackStore.getState().get,
}
