/**
 * usePrefersReducedMotion — F9 Part 1.
 *
 * The canonical reduced-motion hook lives
 * in `lib/motion/reduced-motion.ts` and
 * uses `useSyncExternalStore` (the React-
 * recommended pattern for external stores).
 * F9 P1 consolidated three duplicates
 * (marketing, graph canvas, plus a
 * useState/useEffect inline version) onto
 * this single source of truth.
 *
 * Tests pin the contract that the rest of
 * the codebase relies on:
 *   - Returns false on the server (the
 *     default snapshot).
 *   - Returns the live `matchMedia` value
 *     on the client.
 *   - Re-renders when the media query
 *     changes (the `useSyncExternalStore`
 *     subscribe pattern).
 *   - Returns false in environments
 *     without `matchMedia` (the SSR +
 *     legacy fallback).
 */
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePrefersReducedMotion } from "@/lib/marketing/animations"
import { usePrefersReducedMotion as usePrefersReducedMotionCanonical } from "@/lib/motion/reduced-motion"

describe("usePrefersReducedMotion (canonical hook)", () => {
  type Listener = (e: { matches: boolean }) => void
  let listeners: Listener[] = []
  let currentMatches = false

  const installMatchMedia = (initial: boolean) => {
    currentMatches = initial
    listeners = []
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return currentMatches
        },
        media: query,
        addEventListener: (_: string, cb: Listener) => {
          listeners.push(cb)
        },
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  }

  const setMatches = (next: boolean) => {
    currentMatches = next
    for (const cb of listeners) {
      cb({ matches: next })
    }
  }

  beforeEach(() => {
    installMatchMedia(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns false when the user has not set a preference", () => {
    installMatchMedia(false)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
  })

  it("returns true when matchMedia reports 'reduce'", () => {
    installMatchMedia(true)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(true)
  })

  it("re-renders when the media-query changes (live subscription)", () => {
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
    act(() => {
      setMatches(true)
    })
    expect(result.current).toBe(true)
    act(() => {
      setMatches(false)
    })
    expect(result.current).toBe(false)
  })

  it("returns the server snapshot (`false`) when matchMedia is not implemented", () => {
    // Some legacy test envs + very old
    // browsers don't implement
    // `window.matchMedia`. The hook's
    // `subscribe` + `getSnapshot` both
    // short-circuit to a no-op / `false`
    // so the consumer sees a stable
    // `false` (the "full motion" default)
    // rather than throwing.
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    })
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
  })

  it("is the same hook re-exported by the marketing module", () => {
    // F9 P1 consolidated three duplicates.
    // This test pins the fact that
    // importing the hook from either
    // location yields the same function
    // reference — the marketing module
    // re-exports the canonical hook, not
    // a parallel implementation.
    expect(usePrefersReducedMotion).toBe(usePrefersReducedMotionCanonical)
  })
})
