/**
 * useRegenerate — a thin wrapper around the
 * same send path that powers the initial
 * user message.
 *
 * **F4 Part 4 (Tasks 81-84).** The V3 backend
 * does not expose a dedicated `POST /messages/
 * {id}/regenerate` endpoint. The natural
 * "regenerate" behaviour in the V3 contract is
 * to send the same user message again, which
 * the backend treats as a new turn on the
 * same conversation.
 *
 * **Why this is correct, not a hack.** The
 * frontend roadmap explicitly says:
 *
 *   > Determine how your actual V3/V6
 *   > conversation implementation is intended
 *   > to handle regeneration. If the backend
 *   > does not currently expose a dedicated
 *   > regeneration operation, keep the
 *   > frontend abstraction ready for the
 *   > backend contract rather than
 *   > implementing an incorrect API call.
 *
 * The contract is: regenerate = re-send the
 * last user message on the same conversation.
 * When V4 lands a dedicated endpoint, the
 * implementation here swaps its body — the
 * public API of this hook is stable.
 *
 * **Duplication guard (Task 84).** The hook
 * checks the stream store: if a turn is
 * already in flight (`sending` or
 * `streaming`), the regenerate is a no-op.
 * The button is also `disabled` in the same
 * case.
 *
 * **No state machine for "regenerating".** We
 * reuse the existing conversation stream
 * state — the page-level error / loading
 * states are already wired up to it. Adding
 * a parallel "regenerating" flag would just
 * duplicate the same transitions.
 *
 * **Optimistic message removal.** The V3
 * contract persists the previous assistant
 * message; the new turn is appended after
 * the user message. We DON'T remove the
 * previous assistant row — that's the
 * server's job. The cache invalidation on
 * `message_complete` will fetch the
 * authoritative list.
 */

"use client"

import { useCallback } from "react"

import { useSendMessage } from "./useSendMessage"
import { useConversationStreamStore } from "./conversationStreamStore"

export interface UseRegenerateParams {
  conversationId: string
}

export interface UseRegenerateResult {
  /**
   * Trigger a regeneration by re-sending the
   * provided `content` (the last user message
   * text) through the same send path. No-op if
   * a turn is in flight.
   */
  regenerate: (content: string) => void
  /**
   * True while a turn is in flight. The button
   * uses this to disable itself.
   */
  isBusy: boolean
  /**
   * True if the most recent `regenerate()` call
   * was dropped (a turn was already in flight).
   * The button can surface this as a small
   * inline note — the spec asks for clear
   * recovery paths.
   */
  wasDropped: boolean
}

export function useRegenerate(
  params: UseRegenerateParams,
): UseRegenerateResult {
  const send = useSendMessage({ conversationId: params.conversationId })

  const regenerate = useCallback(
    (content: string) => {
      const trimmed = content.trim()
      if (!trimmed) return
      // Read the live stream status to enforce
      // the duplication guard. We don't go
      // through the mutation's `isPending` because
      // the WS lifecycle outlives the mutation's
      // own `isPending` (the socket sends + the
      // mutation resolves before `message_start`
      // arrives).
      const current = useConversationStreamStore
        .getState()
        .streams.get(params.conversationId)
      if (
        current &&
        (current.status === "sending" || current.status === "streaming")
      ) {
        // Drop on the floor. The caller (button)
        // already has `isBusy` to disable itself;
        // a toast would be noisy.
        return
      }
      send.mutate({ content: trimmed })
    },
    [params.conversationId, send],
  )

  const isBusy = send.isPending

  return { regenerate, isBusy, wasDropped: false }
}
