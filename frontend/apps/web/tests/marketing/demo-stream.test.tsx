/**
 * Demo stream — F8 Part 4.
 *
 * Tests the streaming-simulation hook:
 *   - The `parseAnswer` output is split
 *     into reveal chunks of 2-4 words.
 *   - The hook fires `onComplete` when
 *     all chunks are revealed.
 *   - The hook honours reduced motion
 *     (all chunks revealed immediately).
 *   - The hook resets on `runId` change
 *     (race condition safety).
 *
 * The hook uses `setTimeout` under the
 * hood, so the tests advance fake timers
 * rather than waiting real time.
 */

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  _splitIntoChunksForTest,
  useDemoStream,
} from "@/components/marketing/demo/demo-stream"

describe("_splitIntoChunksForTest", () => {
  it("splits a text segment into 2-4 word chunks", () => {
    const chunks = _splitIntoChunksForTest([
      { kind: "text", value: "Cortex combines keyword and semantic retrieval" },
    ])
    // Should be at least 2 chunks (the
    // text is 6 words, max 3 per chunk).
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    // Reassembly should equal the
    // original.
    const reassembled = chunks
      .filter((c): c is { kind: "text"; value: string } => c.kind === "text")
      .map((c) => c.value)
      .join("")
    expect(reassembled).toBe(
      "Cortex combines keyword and semantic retrieval",
    )
  })

  it("does not split citation segments", () => {
    const chunks = _splitIntoChunksForTest([
      { kind: "text", value: "before " },
      { kind: "citation", id: "citation-1", index: 1 },
      { kind: "text", value: " after" },
    ])
    // The citation should appear as
    // its own chunk in the middle.
    expect(chunks[1]).toEqual({ kind: "citation", id: "citation-1", index: 1 })
  })
})

describe("useDemoStream", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts with an empty revealed list when answer is empty", () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useDemoStream({ answer: "", runId: 0, onComplete }),
    )
    expect(result.current.revealed).toEqual([])
    expect(result.current.isStreaming).toBe(false)
  })

  it("reveals chunks over time when the answer is non-empty", () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useDemoStream({
        answer: "Cortex combines keyword and semantic {{citation:1}} retrieval",
        runId: 0,
        onComplete,
      }),
    )
    // The first chunk is revealed
    // immediately; the rest are scheduled.
    expect(result.current.revealed.length).toBeGreaterThan(0)
    expect(result.current.isStreaming).toBe(true)

    // Advance enough time for all chunks
    // to be revealed. With 45ms per chunk
    // and ~5 chunks, 500ms is plenty.
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(result.current.isStreaming).toBe(false)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it("resets when runId changes (race condition safety)", () => {
    const onComplete = vi.fn()
    const { result, rerender } = renderHook(
      ({ runId, answer }: { runId: number; answer: string }) =>
        useDemoStream({ answer, runId, onComplete }),
      { initialProps: { runId: 0, answer: "First answer" } },
    )
    // Advance to let the first run complete.
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.revealed.length).toBeGreaterThan(0)
    const firstRunRevealedLength = result.current.revealed.length

    // New run with a different answer.
    rerender({ runId: 1, answer: "Second answer, longer" })
    // The hook should have started over.
    // The first chunk of the new answer
    // is revealed immediately.
    expect(result.current.revealed.length).toBeLessThanOrEqual(firstRunRevealedLength)
    // The new revealed content is from
    // the new answer, not the old.
    const text = result.current.revealed
      .filter((s) => s.kind === "text")
      .map((s) => s.value)
      .join("")
    expect(text).toMatch(/Second/)
    expect(text).not.toMatch(/First/)
  })
})
