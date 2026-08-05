/**
 * Page — page-level transition presets.
 *
 * **F1 Part 4 (Task 33).** Use for: App Router segment
 * transitions (cross-fade between (app)/documents and
 * (app)/conversations), the marketing-site Stage 4
 * light → dark threshold (cross-fade + slight scale).
 *
 * **The Stage 4 transition is the *one* place the spec allows
 * a richer in-app animation** (UI-UX §6). `page.threshold` is
 * the preset for it — cross-fade + 1% scale + 600ms duration.
 *
 * **Reduced motion.** The `page.subtle` preset collapses to
 * an instant cross-fade when the user has opted out. Apps
 * should branch on `usePrefersReducedMotion` before applying
 * the richer `page.threshold`.
 */

import { DURATION, EASE } from "./duration"

export interface PagePreset {
  /** CSS class to apply to the page root. */
  className: string
  durationMs: number
  ease: readonly [number, number, number, number]
}

/** Default cross-fade for ordinary route changes. */
export const pageSubtle: PagePreset = {
  className: "animate-page-subtle duration-base",
  durationMs: DURATION.base,
  ease: EASE.outQuint,
}

/**
 * The Stage 4 light → dark threshold (marketing → app).
 * Cross-fade + 1% scale up. The ONE big in-app animation
 * the spec allows.
 */
export const pageThreshold: PagePreset = {
  className: "animate-page-threshold duration-slow",
  durationMs: DURATION.slow,
  ease: EASE.inOutQuart,
}

/** Marketing hero enter. Bold, slow, multi-stop. */
export const pageStage: PagePreset = {
  className: "animate-page-stage",
  durationMs: DURATION.stage,
  ease: EASE.inOutQuart,
}

export const page = {
  subtle: pageSubtle,
  threshold: pageThreshold,
  stage: pageStage,
} as const
