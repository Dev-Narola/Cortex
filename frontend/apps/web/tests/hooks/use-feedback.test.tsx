/**
 * useFeedback — F4 Part 4 (Tasks 86-88).
 *
 * Verifies:
 *   - Initial state is `null`
 *   - apply("up") sets feedback to "up"
 *   - apply("down") switches to "down"
 *   - apply("up") again (after a "down") toggles
 *     back to "up"
 *   - apply(<current value>) clears the value
 *   - Different (conversation, message) pairs
 *     don't leak into each other
 *   - reset() drops everything
 */

import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { feedbackStore, useFeedback } from "@/hooks/chat/useFeedback"

afterEach(() => {
  feedbackStore.reset()
})

describe("useFeedback", () => {
  it("starts with feedback = null", () => {
    const { result } = renderHook(() =>
      useFeedback({ conversationId: "c-1", messageId: "m-1" }),
    )
    expect(result.current.feedback).toBeNull()
  })

  it("apply('up') sets feedback to 'up'", () => {
    const { result } = renderHook(() =>
      useFeedback({ conversationId: "c-1", messageId: "m-1" }),
    )
    act(() => result.current.setFeedback("up"))
    expect(result.current.feedback).toBe("up")
  })

  it("switches to the new value (mutual exclusion)", () => {
    const { result } = renderHook(() =>
      useFeedback({ conversationId: "c-1", messageId: "m-1" }),
    )
    act(() => result.current.setFeedback("up"))
    act(() => result.current.setFeedback("down"))
    expect(result.current.feedback).toBe("down")
    act(() => result.current.setFeedback("up"))
    expect(result.current.feedback).toBe("up")
  })

  it("applying null clears the value (the component owns the toggle)", () => {
    const { result } = renderHook(() =>
      useFeedback({ conversationId: "c-1", messageId: "m-1" }),
    )
    act(() => result.current.setFeedback("down"))
    act(() => result.current.setFeedback(null))
    expect(result.current.feedback).toBeNull()
  })

  it("different (conversation, message) pairs don't leak", () => {
    const a = renderHook(() =>
      useFeedback({ conversationId: "c-1", messageId: "m-1" }),
    )
    const b = renderHook(() =>
      useFeedback({ conversationId: "c-1", messageId: "m-2" }),
    )
    act(() => a.result.current.setFeedback("up"))
    expect(a.result.current.feedback).toBe("up")
    expect(b.result.current.feedback).toBeNull()
  })

  it("reset() drops every entry", () => {
    const a = renderHook(() =>
      useFeedback({ conversationId: "c-1", messageId: "m-1" }),
    )
    act(() => a.result.current.setFeedback("up"))
    act(() => feedbackStore.reset())
    expect(a.result.current.feedback).toBeNull()
  })
})
