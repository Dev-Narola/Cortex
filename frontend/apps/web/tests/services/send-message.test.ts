/**
 * sendMessage (service) — F4 Part 2 (Task 11).
 *
 * The service is a thin shim that:
 *   1. Reads the access token from the
 *      auth store.
 *   2. Initializes the conversation
 *      stream store via `beginTurn`.
 *
 * It does NOT touch the WebSocket
 * directly — that's the stream hook's
 * job. We test the two responsibilities
 * above + the auth guard.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { sendMessage } from "@/services/conversations"
import { useAuthStore } from "@/lib/auth/store"
import {
  conversationStreamStore,
  useConversationStreamStore,
} from "@/hooks/chat/conversationStreamStore"

beforeEach(() => {
  conversationStreamStore.resetAll()
  useAuthStore.setState({
    accessToken: "tok-1",
    hydrated: true,
    restored: true,
    isRestoring: false,
  })
})

afterEach(() => {
  useAuthStore.getState().clear()
  conversationStreamStore.resetAll()
})

describe("sendMessage", () => {
  it("throws when there is no access token", () => {
    useAuthStore.setState({ accessToken: null })
    expect(() =>
      sendMessage({
        conversationId: "c-1",
        content: "hello",
        userMessageId: "um-1",
      }),
    ).toThrow(/not authenticated/i)
  })

  it("throws when the content is empty", () => {
    expect(() =>
      sendMessage({
        conversationId: "c-1",
        content: "   ",
        userMessageId: "um-1",
      }),
    ).toThrow(/empty/i)
  })

  it("initializes the stream store in `sending` state", () => {
    sendMessage({
      conversationId: "c-1",
      content: "Hello",
      userMessageId: "um-1",
    })
    const stream = useConversationStreamStore
      .getState()
      .streams.get("c-1")
    expect(stream?.status).toBe("sending")
    expect(stream?.optimisticUserMessageId).toBe("um-1")
    expect(stream?.pendingContent).toBe("Hello")
  })

  it("is a no-op when a turn is already in flight (Task 28)", () => {
    sendMessage({
      conversationId: "c-1",
      content: "first",
      userMessageId: "um-1",
    })
    // Same conversation, second beginTurn
    // is dropped on the floor.
    sendMessage({
      conversationId: "c-1",
      content: "second",
      userMessageId: "um-2",
    })
    const stream = useConversationStreamStore
      .getState()
      .streams.get("c-1")
    expect(stream?.pendingContent).toBe("first")
    expect(stream?.optimisticUserMessageId).toBe("um-1")
  })
})
