/**
 * usePrefersReducedMotion — F8 Part 1.
 *
 * Tests the F8 marketing animations
 * module:
 *   - `usePrefersReducedMotion` returns
 *     `false` when the OS reports
 *     "no-preference" (the default for
 *     users who haven't set anything).
 *   - It flips to `true` when the OS
 *     reports "reduce".
 *   - The motion vocabulary exposes the
 *     hero timeline windows (the F8 Part
 *     1 spec's choreography).
 */

import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MOTION, usePrefersReducedMotion } from "@/lib/marketing/animations"

describe("usePrefersReducedMotion", () => {
  let listeners: Array<(e: { matches: boolean }) => void> = []

  beforeEach(() => {
    listeners = []
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
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
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns false when the user has not set a preference", () => {
    const { result } = renderHook(() => usePrefersReducedMotion())
    // On the server we default to false;
    // the client effect may flip to true
    // only if matchMedia matches.
    expect(result.current).toBe(false)
  })

  it("flips to true when matchMedia reports 'reduce'", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
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
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(true)
  })

  it("responds to a media-query change", () => {
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
    act(() => {
      listeners.forEach((cb) => cb({ matches: true }))
    })
    expect(result.current).toBe(true)
  })
})

describe("MOTION vocabulary", () => {
  it("exposes the F8 Part 1 hero timeline windows", () => {
    // The F8 spec pins these numbers
    // (~1.4s total choreography). A
    // future contributor adjusting them
    // without re-reading the spec would
    // break the visual contract.
    expect(MOTION.hero.totalMs).toBe(1400)
    expect(MOTION.hero.ambientStartMs).toBe(0)
    expect(MOTION.hero.ambientEndMs).toBe(400)
    expect(MOTION.hero.headlineStartMs).toBe(300)
    expect(MOTION.hero.headlineEndMs).toBe(900)
    expect(MOTION.hero.subheadlineStartMs).toBe(600)
    expect(MOTION.hero.subheadlineEndMs).toBe(1000)
    expect(MOTION.hero.ctaStartMs).toBe(900)
    expect(MOTION.hero.ctaEndMs).toBe(1200)
  })

  it("exposes the headline word stagger", () => {
    expect(MOTION.headlineStaggerMs).toBe(60)
  })

  it("exposes the easing vocabulary", () => {
    expect(MOTION.easing.out).toBe("power3.out")
    expect(MOTION.easing.inOut).toBe("power2.inOut")
  })
})
