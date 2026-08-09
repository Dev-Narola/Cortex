/**
 * useStreamStatus — a small selector hook for
 * the current conversation's stream status.
 *
 * **F4 Part 4 (Tasks 94 + 95).** The interrupted
 * banner reads this to decide whether to render.
 * It's a thin wrapper around the Zustand
 * selector to keep the call sites terse.
 *
 * **Why a hook, not direct access.** Keeping
 * the read inside a hook means the component
 * only re-renders when the slice it cares about
 * changes — calling `getState()` directly would
 * be a one-shot read.
 */

"use client"

import { useConversationStreamStore, type StreamStatus } from "./conversationStreamStore"

export function useStreamStatus(conversationId: string): StreamStatus {
  return useConversationStreamStore(
    (s) => s.streams.get(conversationId)?.status ?? "idle",
  )
}
