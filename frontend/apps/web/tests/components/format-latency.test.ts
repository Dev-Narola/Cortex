/**
 * formatLatency — F5 Part 3 (Task 17).
 *
 * Pure function, no rendering. Boundary cases:
 *   - < 1000ms → "Xms"
 *   - >= 1000ms < 10s → "X.Ys"
 *   - >= 10s → "Ns"
 *   - null / undefined → "—"
 *   - negative → "—" (defensive)
 */

import { describe, expect, it } from "vitest"

import { formatLatency } from "@/components/chat/agents/formatLatency"

describe("formatLatency", () => {
  it("returns 0ms for 0", () => {
    expect(formatLatency(0)).toBe("0ms")
  })

  it("rounds milliseconds to the nearest integer", () => {
    expect(formatLatency(420)).toBe("420ms")
    expect(formatLatency(421.4)).toBe("421ms")
    expect(formatLatency(421.6)).toBe("422ms")
  })

  it("formats sub-second durations in ms", () => {
    expect(formatLatency(999)).toBe("999ms")
  })

  it("switches to seconds at 1000ms", () => {
    expect(formatLatency(1000)).toBe("1.0s")
  })

  it("formats one-decimal seconds under 10s", () => {
    expect(formatLatency(1200)).toBe("1.2s")
    expect(formatLatency(1500)).toBe("1.5s")
    expect(formatLatency(9999)).toBe("10.0s")
  })

  it("switches to integer seconds at 10s", () => {
    expect(formatLatency(10_500)).toBe("11s")
    expect(formatLatency(60_000)).toBe("60s")
  })

  it("returns em-dash for null", () => {
    expect(formatLatency(null)).toBe("—")
  })

  it("returns em-dash for undefined", () => {
    expect(formatLatency(undefined)).toBe("—")
  })

  it("returns em-dash for negative values", () => {
    expect(formatLatency(-100)).toBe("—")
  })
})
