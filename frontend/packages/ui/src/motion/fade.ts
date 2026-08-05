/**
 * Fade — opacity-in / opacity-out presets.
 *
 * **F1 Part 4 (Task 33).** The lightest motion in the system.
 * Use for: tooltips, toast mount/unmount, EmptyState on
 * first render, in-app content swaps.
 *
 * **Variants.**
 *   - `fade` — generic in/out (default timing + ease).
 *   - `fadeFast` — 150ms; tooltips, hover-card hover.
 *   - `fadeSlow` — 400ms; hero CTA on first paint.
 *
 * **Reduced motion.** The CSS keyframes include a
 * `prefers-reduced-motion: reduce` block that ends the
 * animation at the `to` state instantly, so the visual result
 * is identical — the motion is the only thing that disappears.
 */

import { DURATION, EASE } from "./duration"

export interface FadePreset {
  /** CSS class to apply. Composes the `animate-*` utilities. */
  className: string
  /** Duration in ms (for JS consumers). */
  durationMs: number
  /** Cubic-bezier control points (for JS consumers). */
  ease: readonly [number, number, number, number]
}

const fadeClass = (kind: "in" | "out" | "in-out", speed: keyof typeof DURATION = "base") =>
  `animate-${kind === "in-out" ? "fade" : `fade-${kind}`} duration-${speed}`

export const fade: FadePreset = {
  className: fadeClass("in-out", "base"),
  durationMs: DURATION.base,
  ease: EASE.outQuint,
}

export const fadeIn: FadePreset = {
  className: fadeClass("in", "base"),
  durationMs: DURATION.base,
  ease: EASE.outQuint,
}

export const fadeOut: FadePreset = {
  className: fadeClass("out", "base"),
  durationMs: DURATION.base,
  ease: EASE.outQuint,
}

export const fadeFast: FadePreset = {
  className: fadeClass("in", "fast"),
  durationMs: DURATION.fast,
  ease: EASE.outQuint,
}

export const fadeSlow: FadePreset = {
  className: fadeClass("in", "slow"),
  durationMs: DURATION.slow,
  ease: EASE.outQuint,
}
