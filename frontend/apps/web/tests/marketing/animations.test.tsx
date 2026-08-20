/**
 * usePrefersReducedMotion — F8 Part 1.
 * useInView — F8 Part 2.
 *
 * Tests the F8 marketing animations
 * module:
 *   - `usePrefersReducedMotion` returns
 *     `false` when the OS reports
 *     "no-preference" (the default for
 *     users who haven't set anything).
 *   - It flips to `true` when the OS
 *     reports "reduce".
 *   - `useInView` fires the callback when
 *     the element enters the viewport.
 *   - `useInView` does NOT fire again on
 *     a second intersection (plays once
 *     per session, per the F8 spec).
 *   - `useInView` fires immediately when
 *     reduced motion is set.
 *   - The motion vocabulary exposes the
 *     hero + section timeline windows
 *     (the F8 Part 1 + Part 2 spec's
 *     choreography).
 */

import { act, renderHook } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MOTION, useInView, usePrefersReducedMotion } from "@/lib/marketing/animations"

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

describe("useInView", () => {
  type ObservedCallback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void
  let observerInstance: {
    observe: ReturnType<typeof vi.fn>
    unobserve: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    trigger: (intersecting: boolean) => void
  }

  beforeEach(() => {
    // The useInView hook internally
    // calls usePrefersReducedMotion,
    // which reads `window.matchMedia`.
    // The default happy-dom env doesn't
    // implement matchMedia; stub it to
    // report "no preference" (matches:
    // false) so the hook returns false.
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    observerInstance = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      trigger: (_intersecting: boolean) => {},
    }
    // IntersectionObserver is a class;
    // we stub the constructor so each
    // call returns a fresh spy. The
    // `trigger` helper lets the test
    // simulate the observer firing.
    // After `unobserve` is called (the
    // hook's "play once" semantic), the
    // trigger becomes a no-op — matching
    // real IO semantics.
    ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      private cb: ObservedCallback
      private active = true
      constructor(cb: ObservedCallback) {
        this.cb = cb
        observerInstance = {
          observe: vi.fn((el: Element) => {
            observerInstance.trigger = (intersecting: boolean) => {
              if (!this.active) return
              this.cb([{ isIntersecting: intersecting, target: el }])
            }
          }),
          unobserve: vi.fn(() => {
            this.active = false
          }),
          disconnect: vi.fn(() => {
            this.active = false
          }),
          trigger: (_intersecting: boolean) => {},
        }
      }
      observe(el: Element) {
        observerInstance.observe(el)
      }
      unobserve(el: Element) {
        observerInstance.unobserve(el)
      }
      disconnect() {
        observerInstance.disconnect()
      }
    }
  })

  afterEach(() => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
  })

  it("fires the callback when the element enters the viewport", () => {
    const cb = vi.fn()
    function Probe() {
      const ref = useRef<HTMLDivElement>(null)
      // Use a DOM element as the ref so
      // the IO call observes something.
      if (ref.current === null && typeof document !== "undefined") {
        ref.current = document.createElement("div")
      }
      useInView(ref, cb)
      return null
    }
    renderHook(() => Probe())
    // Simulate the element entering the
    // viewport.
    observerInstance.trigger(true)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it("does NOT re-fire on a second intersection (plays once per session)", () => {
    const cb = vi.fn()
    function Probe() {
      const ref = useRef<HTMLDivElement>(null)
      if (ref.current === null && typeof document !== "undefined") {
        ref.current = document.createElement("div")
      }
      useInView(ref, cb)
      return null
    }
    renderHook(() => Probe())
    observerInstance.trigger(true)
    observerInstance.trigger(true)
    expect(cb).toHaveBeenCalledTimes(1)
    // The element is unobserved after the
    // first fire so the IO doesn't
    // re-trigger.
    expect(observerInstance.unobserve).toHaveBeenCalled()
  })

  it("fires immediately when reduced motion is set", () => {
    // Override the beforeEach stub to
    // report reduce.
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true, // ← user prefers reduced motion
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    const cb = vi.fn()
    function Probe() {
      const ref = useRef<HTMLDivElement>(null)
      if (ref.current === null && typeof document !== "undefined") {
        ref.current = document.createElement("div")
      }
      useInView(ref, cb)
      return null
    }
    renderHook(() => Probe())
    // Reduced motion → the callback fires
    // synchronously on mount. The
    // IntersectionObserver is NOT used.
    expect(cb).toHaveBeenCalledTimes(1)
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

  it("exposes the F8 Part 2 section timeline windows", () => {
    expect(MOTION.section.fadeUpMs).toBe(600)
    // The Hybrid Search merge animation.
    const hs = MOTION.section.hybridSearch
    expect(hs.keywordAppearStartMs).toBe(0)
    expect(hs.keywordAppearEndMs).toBe(400)
    expect(hs.semanticAppearStartMs).toBe(250)
    expect(hs.semanticAppearEndMs).toBe(650)
    expect(hs.mergeStartMs).toBe(600)
    expect(hs.mergeEndMs).toBe(1100)
    expect(hs.fusedAppearStartMs).toBe(1000)
    expect(hs.fusedAppearEndMs).toBe(1350)
    expect(hs.rerankSettleStartMs).toBe(1250)
    expect(hs.rerankSettleEndMs).toBe(1600)
  })
})
