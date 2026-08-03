/**
 * View transitions — pure-logic helpers.
 *
 * **F0 scope (Task 45).** Per the spec, the foundation for the
 * Light↔Dark transition needs to exist with no animation yet.
 * The React component layer lives in `view-transitions.tsx`; this
 * file owns the side-effect-free helpers that any non-React
 * caller (tests, server components, future RSC actions) can use
 * without dragging React into the bundle.
 *
 * Splitting it this way keeps the spec's "view-transitions.ts"
 * naming intent (a `.ts` file with no React) while avoiding the
 * ambiguous `.ts` vs `.tsx` resolution the bundler can't disambiguate.
 *
 * The actual motion (an SVG morph, a CSS variable transition, a
 * GSAP timeline) is layered on in F9 — never before.
 */

/**
 * True when `document.startViewTransition` is implemented in
 * the current browser. False on the server.
 */
export function isViewTransitionSupported(): boolean {
  if (typeof document === "undefined") return false
  return "startViewTransition" in document
}

/**
 * Read the OS reduced-motion preference. Resolves to `false`
 * on the server and in any environment without `matchMedia`.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export type TransitionPhase = "idle" | "capturing" | "animating" | "done"

export interface ThemedTransitionOptions {
  /** Override the default reduced-motion check (tests, demos). */
  forceReducedMotion?: boolean
  /** Called when the transition starts capturing the old state. */
  onStart?: () => void
  /** Called when the new state is mounted and the morph begins. */
  onAnimate?: () => void
  /** Called when the browser finishes the morph. */
  onDone?: () => void
}

/**
 * Run `update` inside a view transition when the API is available
 * AND the user hasn't requested reduced motion. Falls back to a
 * synchronous call otherwise. Never throws.
 */
export function startViewTransition(
  update: () => void | Promise<void>,
  options: ThemedTransitionOptions = {},
): void {
  const { forceReducedMotion, onStart, onAnimate, onDone } = options
  const reduced = forceReducedMotion !== undefined ? forceReducedMotion : prefersReducedMotion()

  onStart?.()

  if (reduced || !isViewTransitionSupported()) {
    void Promise.resolve(update()).then(() => {
      onDone?.()
    })
    return
  }

  const transition = (
    document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => {
        ready: Promise<void>
        finished: Promise<void>
      }
    }
  ).startViewTransition?.(async () => {
    await update()
    onAnimate?.()
  })

  if (transition) {
    transition.finished.catch(() => {})
    transition.ready.then(() => onAnimate?.()).catch(() => {})
  } else {
    onDone?.()
  }
}
