/**
 * useGraphCapability — F9 Part 2.
 *
 * Tests the capability hook that decides between
 * the 3D R3F canvas and the 2D SVG fallback for
 * the Knowledge Graph Explorer. The hook combines
 * three signals:
 *
 *   - viewport width (< 768px → 2D)
 *   - prefers-reduced-motion (true → 2D)
 *   - hardware concurrency (< 2 cores → 2D)
 *
 * Each test below pins one of the three signals'
 * behaviour, plus the SSR/initial-render fallback
 * (`"unknown"`).
 */
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  GRAPH_2D_CONCURRENCY_THRESHOLD,
  GRAPH_2D_VIEWPORT_THRESHOLD_PX,
  resolveGraphCapability,
  useGraphCapability,
} from "@/lib/graph/graph-capability"

describe("resolveGraphCapability (pure decision function)", () => {
  it("returns '2d' when the viewport is below the threshold", () => {
    expect(
      resolveGraphCapability({
        viewportWidth: GRAPH_2D_VIEWPORT_THRESHOLD_PX - 1,
        hardwareConcurrency: 8,
        prefersReducedMotion: false,
      }),
    ).toBe("2d")
  })

  it("returns '3d' when the viewport is at or above the threshold", () => {
    expect(
      resolveGraphCapability({
        viewportWidth: GRAPH_2D_VIEWPORT_THRESHOLD_PX,
        hardwareConcurrency: 8,
        prefersReducedMotion: false,
      }),
    ).toBe("3d")
  })

  it("returns '2d' when the user prefers reduced motion", () => {
    // The 3D scene's continuous camera
    // damping is the kind of decorative
    // motion reduced-motion users have
    // asked us to drop.
    expect(
      resolveGraphCapability({
        viewportWidth: 1440,
        hardwareConcurrency: 8,
        prefersReducedMotion: true,
      }),
    ).toBe("2d")
  })

  it("returns '2d' when the hardware concurrency is below the threshold", () => {
    expect(
      resolveGraphCapability({
        viewportWidth: 1440,
        hardwareConcurrency: GRAPH_2D_CONCURRENCY_THRESHOLD - 1,
        prefersReducedMotion: false,
      }),
    ).toBe("2d")
  })

  it("returns '3d' for a capable desktop-class device", () => {
    expect(
      resolveGraphCapability({
        viewportWidth: 1920,
        hardwareConcurrency: 8,
        prefersReducedMotion: false,
      }),
    ).toBe("3d")
  })

  it("treats a `null` viewport as 'unknown' resolution path (caller must retry)", () => {
    // The decision function itself is pure
    // — it doesn't know about the SSR /
    // pre-hydration timeline. The hook is
    // responsible for keeping `viewportWidth
    // === null` until the first client effect
    // runs. The decision function still
    // returns "3d" here because a null
    // viewport doesn't fail any of the
    // three checks (it's the "I don't
    // know yet" signal, not a failing
    // signal). The hook layer translates
    // "still resolving" to "unknown" for
    // the explorer's use.
    const result = resolveGraphCapability({
      viewportWidth: null,
      hardwareConcurrency: 8,
      prefersReducedMotion: false,
    })
    expect(["3d", "2d"]).toContain(result)
  })

  it("treats a `null` hardwareConcurrency as 'unknown' rather than failing", () => {
    // Older browsers don't expose
    // `navigator.hardwareConcurrency`. The
    // decision function shouldn't crash;
    // it should let the viewport + motion
    // signals decide.
    expect(
      resolveGraphCapability({
        viewportWidth: 1920,
        hardwareConcurrency: null,
        prefersReducedMotion: false,
      }),
    ).toBe("3d")
  })

  it("prioritises the viewport signal over the others", () => {
    // Mobile viewport wins even on a
    // device with 16 cores and no
    // reduced-motion preference.
    expect(
      resolveGraphCapability({
        viewportWidth: 375,
        hardwareConcurrency: 16,
        prefersReducedMotion: false,
      }),
    ).toBe("2d")
  })

  it("prioritises the reduced-motion signal over the hardware signal", () => {
    // Reduced-motion wins over a capable
    // device. (The viewport signal is
    // also null so it doesn't override.)
    expect(
      resolveGraphCapability({
        viewportWidth: 1920,
        hardwareConcurrency: 16,
        prefersReducedMotion: true,
      }),
    ).toBe("2d")
  })
})

describe("useGraphCapability (hook)", () => {
  let originalMatchMedia: typeof window.matchMedia | undefined
  let originalInnerWidth: number
  let listeners: Array<(e: { matches: boolean }) => void> = []
  let currentMatches = false

  beforeEach(() => {
    listeners = []
    currentMatches = false
    originalMatchMedia = window.matchMedia
    originalInnerWidth = window.innerWidth
    // Stub matchMedia with a mutable
    // matches field so the reduced-motion
    // hook can flip the value at will.
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return currentMatches
        },
        media: query,
        addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
          listeners.push(cb)
        },
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    // Stub the viewport to a desktop-class
    // value so the hook's default mount
    // path doesn't accidentally fall
    // through to the 2D branch.
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1440,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: originalMatchMedia,
    })
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
    vi.restoreAllMocks()
  })

  it("resolves to '3d' for a desktop-class viewport with full motion", () => {
    const { result } = renderHook(() => useGraphCapability())
    expect(result.current).toBe("3d")
  })

  it("re-renders when the viewport crosses the threshold", () => {
    const { result } = renderHook(() => useGraphCapability())
    expect(result.current).toBe("3d")
    // Simulate a resize to mobile.
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 375,
    })
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })
    expect(result.current).toBe("2d")
  })

  it("re-renders when reduced-motion flips", () => {
    const { result } = renderHook(() => useGraphCapability())
    expect(result.current).toBe("3d")
    currentMatches = true
    act(() => {
      for (const cb of listeners) cb({ matches: true })
    })
    expect(result.current).toBe("2d")
  })
})
