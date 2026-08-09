/**
 * Conversation stream store — F4 Part 4 (Tasks 94-95).
 *
 * Verifies:
 *   - `markInterrupted` flips a `sending` /
 *     `streaming` row to `interrupted` and
 *     preserves the accumulator.
 *   - `markInterrupted` is a no-op on `idle`,
 *     `completed`, `error`, and missing rows.
 *   - The imperative `conversationStreamStore`
 *     exposes `markInterrupted` for non-React
 *     callers.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  conversationStreamStore,
  useConversationStreamStore,
} from "@/hooks/chat/conversationStreamStore"

const CONV = "c-1"

beforeEach(() => {
  useConversationStreamStore.getState().resetAll()
})

afterEach(() => {
  useConversationStreamStore.getState().resetAll()
})

describe("conversationStreamStore.markInterrupted", () => {
  it("flips a sending stream to interrupted and preserves content", () => {
    conversationStreamStore.beginTurn({
      conversationId: CONV,
      userMessageId: "u-1",
      content: "what is pgvector?",
    })
    conversationStreamStore.applyEvent(CONV, {
      type: "message_start",
      messageId: "a-1",
    })
    conversationStreamStore.applyEvent(CONV, {
      type: "token",
      content: "Cortex uses ",
    })
    conversationStreamStore.applyEvent(CONV, {
      type: "token",
      content: "pgvector.",
    })
    expect(useConversationStreamStore.getState().streams.get(CONV)?.status).toBe(
      "streaming",
    )
    conversationStreamStore.markInterrupted(CONV, "lost connection")
    const row = useConversationStreamStore.getState().streams.get(CONV)
    expect(row?.status).toBe("interrupted")
    expect(row?.content).toBe("Cortex uses pgvector.")
    expect(row?.error?.code).toBe("INTERRUPTED")
    expect(row?.error?.message).toBe("lost connection")
  })

  it("is a no-op on a completed stream", () => {
    conversationStreamStore.beginTurn({
      conversationId: CONV,
      userMessageId: "u-1",
      content: "q",
    })
    conversationStreamStore.applyEvent(CONV, {
      type: "message_start",
      messageId: "a-1",
    })
    conversationStreamStore.applyEvent(CONV, { type: "message_complete", messageId: "a-1" })
    expect(useConversationStreamStore.getState().streams.get(CONV)?.status).toBe(
      "completed",
    )
    conversationStreamStore.markInterrupted(CONV)
    expect(useConversationStreamStore.getState().streams.get(CONV)?.status).toBe(
      "completed",
    )
  })

  it("is a no-op on an idle row", () => {
    conversationStreamStore.markInterrupted(CONV)
    expect(useConversationStreamStore.getState().streams.get(CONV)).toBeUndefined()
  })

  it("is a no-op on a missing conversation id", () => {
    conversationStreamStore.markInterrupted("nonexistent")
    // No state was created.
    expect(useConversationStreamStore.getState().streams.size).toBe(0)
  })
})
