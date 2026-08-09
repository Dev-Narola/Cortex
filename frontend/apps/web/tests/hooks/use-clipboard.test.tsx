/**
 * useClipboard — F4 Part 4 (Tasks 78-80).
 */

import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useClipboard } from "@/components/chat/useClipboard"

const savedClipboard = (
  navigator as Navigator & { _cortexOrigClipboard?: unknown }
)._cortexOrigClipboard

function restoreClipboard(): void {
  if (savedClipboard !== undefined) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: savedClipboard,
    })
  }
}

afterEach(() => {
  restoreClipboard()
})

describe("useClipboard", () => {
  it("returns idle state initially", () => {
    const { result } = renderHook(() => useClipboard())
    expect(result.current.state).toBe("idle")
    expect(result.current.error).toBeNull()
  })

  it("writes to the clipboard when navigator.clipboard.writeText exists", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const { result } = renderHook(() => useClipboard())
    await act(async () => {
      await result.current.copy("hello")
    })
    expect(writeText).toHaveBeenCalledWith("hello")
    expect(result.current.state).toBe("success")
  })

  it("surfaces a write error as state='error' + error message", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("blocked")),
      },
    })
    const { result } = renderHook(() => useClipboard())
    await act(async () => {
      await result.current.copy("x")
    })
    expect(result.current.state).toBe("error")
    expect(result.current.error?.message).toBe("blocked")
  })

  it("returns state='error' when navigator.clipboard is missing", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })
    const { result } = renderHook(() => useClipboard())
    await act(async () => {
      await result.current.copy("x")
    })
    expect(result.current.state).toBe("error")
    expect(result.current.error?.message).toMatch(/not support/i)
  })

  it("auto-clears success after ~1.5s", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    const { result } = renderHook(() => useClipboard())
    await act(async () => {
      await result.current.copy("x")
    })
    expect(result.current.state).toBe("success")
    await waitFor(
      () => {
        expect(result.current.state).toBe("idle")
      },
      { timeout: 2500 },
    )
  })
})
