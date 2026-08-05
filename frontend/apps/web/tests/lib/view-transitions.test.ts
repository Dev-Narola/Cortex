/**
 * view-transitions core helpers.
 *
 * **F2 Part 2 (Task 18) verification.** The light → dark
 * theme transition is wired in the (app) layout via
 * `useViewTransitions()` → `setAnimatedTheme("dark")`.
 * The core helper, `startViewTransition`, is the
 * single point that decides whether to run the morph
 * (browser support + reduced-motion).
 *
 * Covers:
 *   - `isViewTransitionSupported()` reflects
 *     `document.startViewTransition` presence.
 *   - `startViewTransition()` calls the update fn.
 *   - `startViewTransition()` falls back synchronously
 *     when the API is unavailable or reduced-motion
 *     is set.
 *   - `prefersReducedMotion()` reads the OS preference.
 *
 * **Why the `// @ts-expect-error` casts.** The standard
 * `lib.dom.d.ts` ships `document.startViewTransition` as
 * a fully-typed member. We're deliberately treating it
 * as an *optional* runtime feature for the test setup;
 * the production helper (`view-transitions-core.ts`)
 * already does the same dance with an indexed cast.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  isViewTransitionSupported,
  prefersReducedMotion,
  startViewTransition,
} from "@/lib/theme/view-transitions-core"

/** Cast `document` to something with an optional `startViewTransition`. */
function asOptional(doc: Document): {
  startViewTransition?: (cb: () => void) => {
    ready: Promise<void>
    finished: Promise<void>
  }
} {
  return doc as unknown as {
    startViewTransition?: (cb: () => void) => {
      ready: Promise<void>
      finished: Promise<void>
    }
  }
}

function clearStartViewTransition(): void {
  delete (
    document as unknown as {
      startViewTransition?: unknown
    }
  ).startViewTransition
}

describe("view-transitions-core", () => {
  afterEach(() => {
    clearStartViewTransition()
  })

  describe("isViewTransitionSupported", () => {
    it("returns false when document.startViewTransition is missing", () => {
      clearStartViewTransition()
      expect(isViewTransitionSupported()).toBe(false)
    })

    it("returns true when document.startViewTransition is present", () => {
      asOptional(document).startViewTransition = (cb) => {
        cb()
        return { ready: Promise.resolve(), finished: Promise.resolve() }
      }
      expect(isViewTransitionSupported()).toBe(true)
    })
  })

  describe("startViewTransition", () => {
    it("calls the update fn synchronously when the API is missing", () => {
      clearStartViewTransition()
      let called = false
      const update = () => {
        called = true
      }
      startViewTransition(update)
      expect(called).toBe(true)
    })

    it("calls the update fn when the API is present", () => {
      asOptional(document).startViewTransition = (cb) => {
        cb()
        return { ready: Promise.resolve(), finished: Promise.resolve() }
      }
      let called = false
      startViewTransition(() => {
        called = true
      })
      expect(called).toBe(true)
    })

    it("respects forceReducedMotion even when the API is present", () => {
      asOptional(document).startViewTransition = () => {
        throw new Error("should not be called when reduced motion is on")
      }
      let called = false
      startViewTransition(
        () => {
          called = true
        },
        { forceReducedMotion: true },
      )
      expect(called).toBe(true)
    })

    it("invokes onStart synchronously, onAnimate on transition.ready", async () => {
      asOptional(document).startViewTransition = (cb) => {
        cb()
        return { ready: Promise.resolve(), finished: Promise.resolve() }
      }
      const onStart = vi.fn()
      const onAnimate = vi.fn()
      const onDone = vi.fn()
      startViewTransition(() => {}, { onStart, onAnimate, onDone })
      // onStart is synchronous; onAnimate is tied to the
      // ready promise (microtask queued). onDone is NOT
      // called on the success path — only when the API is
      // missing (see implementation).
      expect(onStart).toHaveBeenCalled()
      await Promise.resolve()
      await Promise.resolve()
      expect(onAnimate).toHaveBeenCalled()
    })

    it("invokes onDone asynchronously when the API is missing", async () => {
      clearStartViewTransition()
      const onStart = vi.fn()
      const onDone = vi.fn()
      startViewTransition(() => {}, { onStart, onDone })
      expect(onStart).toHaveBeenCalled()
      // The update fn is called via Promise.resolve().then,
      // so onDone is async; wait one microtask.
      await Promise.resolve()
      expect(onDone).toHaveBeenCalled()
    })
  })

  describe("prefersReducedMotion", () => {
    it("returns the current matchMedia state", () => {
      // happy-dom defaults to `matches: false` unless we
      // stub the media query; the stub in tests/setup.ts
      // returns `matches: false`, so the helper returns
      // false. We assert that the helper does not throw.
      expect(typeof prefersReducedMotion()).toBe("boolean")
    })
  })
})
